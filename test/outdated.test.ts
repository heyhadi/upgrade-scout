import { describe, expect, it } from 'vitest';
import { majorsBehind, withLatestVersions } from '../src/outdated.js';
import type { ResolvedDependency } from '../src/manifest.js';

describe('majorsBehind', () => {
  it.each([
    ['17.0.2', '19.2.0', 2],
    ['19.0.0', '19.2.0', 0],
    ['19.2.0', '19.2.0', 0],
    ['20.0.0-canary.1', '19.2.0', 0],
    ['0.4.1', '0.6.0', 2],
    ['0.4.1', '0.4.9', 0],
    ['0.9.0', '2.1.0', 2],
  ])('%s → %s is %i behind', (current, latest, expected) => {
    expect(majorsBehind(current, latest)).toBe(expected);
  });
});

describe('withLatestVersions', () => {
  const react: ResolvedDependency = {
    name: 'react',
    registryName: 'react',
    range: '^17.0.0',
    field: 'dependencies',
    current: '17.0.2',
    currentSource: 'lockfile',
  };

  it('attaches latest versions and lookup errors', () => {
    const lookups = new Map([['react', { name: 'react', ok: true as const, latest: '19.2.0' }]]);
    expect(withLatestVersions([react], lookups)[0]).toMatchObject({ latest: '19.2.0', majorsBehind: 2 });

    const failed = new Map([['react', { name: 'react', ok: false as const, error: 'timed out' }]]);
    expect(withLatestVersions([react], failed)[0]).toMatchObject({ latest: null, majorsBehind: null, lookupError: 'timed out' });
  });

  it('leaves versions unknown when the registry was skipped', () => {
    expect(withLatestVersions([react], null)[0]).toMatchObject({ latest: null, majorsBehind: null });
  });
});
