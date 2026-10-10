import semver from 'semver';
import type { ResolvedDependency } from './manifest.js';
import type { LatestVersionLookup } from './registry.js';

export interface DependencyStatus extends ResolvedDependency {
  latest: string | null;
  /** Breaking releases between current and latest; null when either side is unknown. */
  majorsBehind: number | null;
  lookupError?: string;
}

/**
 * Counts breaking releases between two versions. Below 1.0.0 semver treats every minor as
 * breaking (that's what `^0.4.0` means), so 0.4 → 0.6 counts as two.
 */
export function majorsBehind(current: string, latest: string): number {
  const from = semver.parse(current);
  const to = semver.parse(latest);
  if (!from || !to || semver.gte(from, to)) return 0;
  if (from.major === 0 && to.major === 0) return to.minor - from.minor;
  if (from.major === 0) return to.major; // 0.x → N.x: leaving 0.x is itself breaking
  return to.major - from.major;
}

export function withLatestVersions(
  dependencies: ResolvedDependency[],
  lookups: Map<string, LatestVersionLookup> | null,
): DependencyStatus[] {
  return dependencies.map((dependency) => {
    const lookup = lookups?.get(dependency.registryName);
    if (!lookup) return { ...dependency, latest: null, majorsBehind: null };
    if (!lookup.ok) return { ...dependency, latest: null, majorsBehind: null, lookupError: lookup.error };
    return {
      ...dependency,
      latest: lookup.latest,
      majorsBehind: dependency.current ? majorsBehind(dependency.current, lookup.latest) : null,
    };
  });
}
