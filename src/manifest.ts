import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';

export type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies';

const DEPENDENCY_FIELDS: DependencyField[] = ['dependencies', 'devDependencies', 'optionalDependencies'];

export interface PackageManifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: { node?: string };
}

export interface DeclaredDependency {
  /** Key in package.json — for `npm:` aliases this is the alias, which is also the node_modules folder. */
  name: string;
  /** Name to look up in the registry (differs from `name` only for aliases). */
  registryName: string;
  range: string;
  field: DependencyField;
}

export interface SkippedDependency {
  name: string;
  range: string;
  reason: string;
}

export type VersionSource = 'node_modules' | 'lockfile' | 'range';

export interface ResolvedDependency extends DeclaredDependency {
  /** Best guess at the version the project runs today. */
  current: string | null;
  currentSource: VersionSource | null;
}

export class ManifestNotFoundError extends Error {
  constructor(readonly projectDir: string) {
    super(`No package.json found in ${projectDir}`);
  }
}

export async function readManifest(projectDir: string): Promise<{ manifest: PackageManifest; text: string }> {
  const manifestPath = path.join(projectDir, 'package.json');
  let text: string;
  try {
    text = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) throw new ManifestNotFoundError(projectDir);
    throw error;
  }
  return { manifest: JSON.parse(text) as PackageManifest, text };
}

const NON_REGISTRY_PROTOCOLS = /^(workspace|file|link|portal|patch|git|git\+[a-z]+|github|gitlab|bitbucket|https?):/;

/** Splits package.json dependencies into ones the registry can answer for and ones it can't. */
export function listRegistryDependencies(manifest: PackageManifest): {
  dependencies: DeclaredDependency[];
  skipped: SkippedDependency[];
} {
  const dependencies: DeclaredDependency[] = [];
  const skipped: SkippedDependency[] = [];
  const seen = new Set<string>();

  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, rawRange] of Object.entries(manifest[field] ?? {})) {
      if (seen.has(name)) continue;
      seen.add(name);

      let registryName = name;
      let range = rawRange.trim();
      if (range.startsWith('npm:')) {
        const aliased = parseAlias(range.slice('npm:'.length));
        registryName = aliased.name;
        range = aliased.range;
      }

      if (NON_REGISTRY_PROTOCOLS.test(range)) {
        skipped.push({ name, range: rawRange, reason: 'not installed from the registry' });
      } else if (semver.validRange(range) === null) {
        // Dist-tags (`latest`), GitHub shorthands (`user/repo`) and typos all land here.
        skipped.push({ name, range: rawRange, reason: 'not a semver range' });
      } else {
        dependencies.push({ name, registryName, range, field });
      }
    }
  }

  return { dependencies, skipped };
}

function parseAlias(spec: string): { name: string; range: string } {
  // `@scope/pkg@^1.2.0` — the version separator is the last `@` that isn't the scope marker.
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, range: '*' };
  return { name: spec.slice(0, at), range: spec.slice(at + 1) || '*' };
}

interface NpmLockfile {
  packages?: Record<string, { version?: string }>;
  dependencies?: Record<string, { version?: string }>;
}

/**
 * Resolves what each dependency is actually at today: the installed copy wins, then the
 * npm lockfile, then the lowest version the range allows.
 */
export async function resolveCurrentVersions(
  projectDir: string,
  dependencies: DeclaredDependency[],
): Promise<ResolvedDependency[]> {
  const lockfile = await readNpmLockfile(projectDir);

  return Promise.all(
    dependencies.map(async (dependency): Promise<ResolvedDependency> => {
      const installed = await readInstalledVersion(projectDir, dependency.name);
      if (installed) return { ...dependency, current: installed, currentSource: 'node_modules' };

      const locked = lockfileVersion(lockfile, dependency.name);
      if (locked) return { ...dependency, current: locked, currentSource: 'lockfile' };

      const minimum = semver.minVersion(dependency.range)?.version ?? null;
      return { ...dependency, current: minimum, currentSource: minimum ? 'range' : null };
    }),
  );
}

async function readInstalledVersion(projectDir: string, name: string): Promise<string | null> {
  try {
    const text = await readFile(path.join(projectDir, 'node_modules', name, 'package.json'), 'utf8');
    return validVersion((JSON.parse(text) as { version?: unknown }).version);
  } catch {
    return null;
  }
}

async function readNpmLockfile(projectDir: string): Promise<NpmLockfile | null> {
  for (const file of ['package-lock.json', 'npm-shrinkwrap.json']) {
    try {
      return JSON.parse(await readFile(path.join(projectDir, file), 'utf8')) as NpmLockfile;
    } catch {
      // Missing or unreadable; try the next one.
    }
  }
  return null;
}

function lockfileVersion(lockfile: NpmLockfile | null, name: string): string | null {
  if (!lockfile) return null;
  // lockfileVersion 2/3 key by install path; version 1 keys by package name.
  return validVersion(lockfile.packages?.[`node_modules/${name}`]?.version ?? lockfile.dependencies?.[name]?.version);
}

function validVersion(value: unknown): string | null {
  return typeof value === 'string' ? semver.valid(value) : null;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}
