import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import type { PackageManifest } from './manifest.js';

/** End-of-life dates from https://github.com/nodejs/Release — update when a new line ships. */
const END_OF_LIFE: Record<number, string> = {
  10: '2021-04-30',
  11: '2019-06-01',
  12: '2022-04-30',
  13: '2020-06-01',
  14: '2023-04-30',
  15: '2021-06-01',
  16: '2023-09-11',
  17: '2022-06-01',
  18: '2025-04-30',
  19: '2023-06-01',
  20: '2026-04-30',
  21: '2024-06-01',
  22: '2027-04-30',
  23: '2025-06-01',
  24: '2028-04-30',
  25: '2026-06-01',
  26: '2029-04-30',
};

const LTS_CODENAMES: Record<string, number> = {
  argon: 4,
  boron: 6,
  carbon: 8,
  dubnium: 10,
  erbium: 12,
  fermium: 14,
  gallium: 16,
  hydrogen: 18,
  iron: 20,
  jod: 22,
  krypton: 24,
};

const SOON_DAYS = 180;

export type NodeSupportStatus = 'eol' | 'eol-soon' | 'supported' | 'unknown';

export interface NodeVersionCheck {
  /** Where the version came from, e.g. `.nvmrc` or `engines.node`. */
  source: string;
  declared: string;
  major: number | null;
  status: NodeSupportStatus;
  endOfLife: string | null;
}

export function nodeSupportStatus(major: number, now: Date): { status: NodeSupportStatus; endOfLife: string | null } {
  // Anything older than the table is long dead.
  if (major < 10) return { status: 'eol', endOfLife: null };
  const endOfLife = END_OF_LIFE[major];
  if (!endOfLife) return { status: 'unknown', endOfLife: null };
  const daysLeft = (Date.parse(endOfLife) - now.getTime()) / 86_400_000;
  if (daysLeft <= 0) return { status: 'eol', endOfLife };
  return { status: daysLeft <= SOON_DAYS ? 'eol-soon' : 'supported', endOfLife };
}

/** Parses `.nvmrc`-style contents: `18`, `v18.17.0`, `lts/hydrogen`. */
export function parseNodeVersionFile(contents: string): number | null {
  const line = contents.split(/\r?\n/).find((candidate) => candidate.trim() && !candidate.trim().startsWith('#'));
  if (!line) return null;
  const value = line.trim().toLowerCase();
  if (value.startsWith('lts/')) return LTS_CODENAMES[value.slice('lts/'.length)] ?? null;
  const coerced = semver.coerce(value);
  return coerced ? coerced.major : null;
}

export async function checkNodeVersions(
  projectDir: string,
  manifest: PackageManifest,
  now: Date,
): Promise<NodeVersionCheck[]> {
  const checks: NodeVersionCheck[] = [];

  for (const file of ['.nvmrc', '.node-version']) {
    let contents: string;
    try {
      contents = await readFile(path.join(projectDir, file), 'utf8');
    } catch {
      continue;
    }
    checks.push(toCheck(file, contents.trim(), parseNodeVersionFile(contents), now));
  }

  const engines = manifest.engines?.node;
  if (engines) {
    // The floor is what matters: `>=14` promises support for 14 even if CI runs 22.
    const floor = semver.validRange(engines) ? semver.minVersion(engines) : null;
    checks.push(toCheck('engines.node', engines, floor ? floor.major : null, now));
  }

  return checks;
}

function toCheck(source: string, declared: string, major: number | null, now: Date): NodeVersionCheck {
  if (major === null) return { source, declared, major, status: 'unknown', endOfLife: null };
  return { source, declared, major, ...nodeSupportStatus(major, now) };
}
