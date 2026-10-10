import type { Project } from 'ts-morph';
import {
  listRegistryDependencies,
  readManifest,
  resolveCurrentVersions,
  type ResolvedDependency,
  type SkippedDependency,
} from './manifest.js';
import { checkNodeVersions, type NodeVersionCheck } from './node-eol.js';
import { type DependencyStatus, withLatestVersions } from './outdated.js';
import { RULE_PACKS } from './packs/index.js';
import type { Finding, RulePack, ScanContext, Severity } from './packs/types.js';
import { fetchLatestVersions, type RegistryOptions } from './registry.js';

export interface OverviewOptions {
  projectDir: string;
  /** `null` skips the registry (offline mode); packs and Node checks still run. */
  registry: RegistryOptions | null;
  now: Date;
  packs?: RulePack[];
}

export interface PackResult {
  id: string;
  title: string;
  packageName: string;
  currentVersion: string;
  targetMajor: number;
  rules: { id: string; severity: Severity; title: string; docsUrl: string; findings: number }[];
  findings: Finding[];
  mustFix: number;
  review: number;
}

export interface OverviewResult {
  projectDir: string;
  projectName: string | null;
  registryUrl: string | null;
  dependencies: DependencyStatus[];
  skipped: SkippedDependency[];
  node: NodeVersionCheck[];
  packs: PackResult[];
}

export async function runOverview(options: OverviewOptions): Promise<OverviewResult> {
  const { projectDir } = options;
  const { manifest, text: manifestText } = await readManifest(projectDir);
  const { dependencies: declared, skipped } = listRegistryDependencies(manifest);
  const resolved = await resolveCurrentVersions(projectDir, declared);

  const [lookups, node, packs] = await Promise.all([
    options.registry
      ? fetchLatestVersions(
          resolved.map((dependency) => dependency.registryName),
          options.registry,
        )
      : null,
    checkNodeVersions(projectDir, manifest, options.now),
    runPacks(options.packs ?? RULE_PACKS, { projectDir, dependencies: resolved, manifestText }),
  ]);

  return {
    projectDir,
    projectName: manifest.name ?? null,
    registryUrl: options.registry?.registryUrl ?? null,
    dependencies: withLatestVersions(resolved, lookups),
    skipped,
    node,
    packs,
  };
}

async function runPacks(
  packs: RulePack[],
  base: { projectDir: string; dependencies: ResolvedDependency[]; manifestText: string },
): Promise<PackResult[]> {
  let project: Promise<Project> | undefined;
  const context: ScanContext = {
    ...base,
    // ts-morph is the slowest thing we load; only pay for it when a pack applies.
    getProject: () =>
      (project ??= import('./scan/project.js').then(({ createScanProject }) => createScanProject(base.projectDir))),
  };

  const results: PackResult[] = [];
  for (const pack of packs) {
    const target = base.dependencies.find((dependency) => dependency.registryName === pack.packageName);
    if (!target?.current || !pack.appliesTo(target.current)) continue;

    const perRule = await Promise.all(pack.rules.map((rule) => rule.check(context)));
    const findings = perRule.flat().sort(byLocation);
    results.push({
      id: pack.id,
      title: pack.title,
      packageName: pack.packageName,
      currentVersion: target.current,
      targetMajor: pack.targetMajor,
      rules: pack.rules.map((rule, index) => ({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        docsUrl: rule.docsUrl,
        findings: perRule[index]!.length,
      })),
      findings,
      mustFix: findings.filter((finding) => finding.severity === 'must-fix').length,
      review: findings.filter((finding) => finding.severity === 'review').length,
    });
  }
  return results;
}

function byLocation(a: Finding, b: Finding): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}
