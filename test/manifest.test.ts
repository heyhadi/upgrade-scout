import { describe, expect, it } from 'vitest';
import { listRegistryDependencies, readManifest, resolveCurrentVersions, ManifestNotFoundError } from '../src/manifest.js';
import { tempProject } from './helpers/temp-project.js';

describe('listRegistryDependencies', () => {
  it('reads every dependency field and keeps the first declaration of a name', () => {
    const { dependencies } = listRegistryDependencies({
      dependencies: { react: '^17.0.2' },
      devDependencies: { vitest: '^1.0.0', react: '^18.0.0' },
      optionalDependencies: { fsevents: '^2.3.0' },
    });

    expect(dependencies.map(({ name, field, range }) => [name, field, range])).toEqual([
      ['react', 'dependencies', '^17.0.2'],
      ['vitest', 'devDependencies', '^1.0.0'],
      ['fsevents', 'optionalDependencies', '^2.3.0'],
    ]);
  });

  it('looks up npm: aliases under their real name', () => {
    const { dependencies } = listRegistryDependencies({
      dependencies: { 'ui-kit': 'npm:@acme/ui-kit@^2.1.0', legacy: 'npm:react-select@4.3.1', bare: 'npm:lodash' },
    });

    expect(dependencies.map(({ name, registryName, range }) => [name, registryName, range])).toEqual([
      ['ui-kit', '@acme/ui-kit', '^2.1.0'],
      ['legacy', 'react-select', '4.3.1'],
      ['bare', 'lodash', '*'],
    ]);
  });

  it('skips dependencies the registry cannot answer for', () => {
    const { dependencies, skipped } = listRegistryDependencies({
      dependencies: {
        shared: 'workspace:*',
        local: 'file:../local',
        fork: 'git+https://github.com/someone/fork.git',
        shorthand: 'someone/repo',
        tagged: 'latest',
        real: '~1.2.3',
      },
    });

    expect(dependencies.map((dependency) => dependency.name)).toEqual(['real']);
    expect(skipped).toEqual([
      { name: 'shared', range: 'workspace:*', reason: 'not installed from the registry' },
      { name: 'local', range: 'file:../local', reason: 'not installed from the registry' },
      { name: 'fork', range: 'git+https://github.com/someone/fork.git', reason: 'not installed from the registry' },
      { name: 'shorthand', range: 'someone/repo', reason: 'not a semver range' },
      { name: 'tagged', range: 'latest', reason: 'not a semver range' },
    ]);
  });
});

describe('resolveCurrentVersions', () => {
  it('prefers node_modules, then the lockfile, then the bottom of the range', async () => {
    const dir = await tempProject({
      'node_modules/react/package.json': { name: 'react', version: '17.0.1' },
      'package-lock.json': {
        lockfileVersion: 3,
        packages: {
          'node_modules/react': { version: '17.0.2' },
          'node_modules/react-dom': { version: '17.0.2' },
        },
      },
    });
    const { dependencies } = listRegistryDependencies({
      dependencies: { react: '^17.0.0', 'react-dom': '^17.0.0', lodash: '^4.17.0' },
    });

    const resolved = await resolveCurrentVersions(dir, dependencies);

    expect(resolved.map(({ name, current, currentSource }) => [name, current, currentSource])).toEqual([
      ['react', '17.0.1', 'node_modules'],
      ['react-dom', '17.0.2', 'lockfile'],
      ['lodash', '4.17.0', 'range'],
    ]);
  });

  it('reads lockfileVersion 1 lockfiles', async () => {
    const dir = await tempProject({
      'package-lock.json': { lockfileVersion: 1, dependencies: { react: { version: '16.14.0' } } },
    });
    const { dependencies } = listRegistryDependencies({ dependencies: { react: '^16.8.0' } });

    const [react] = await resolveCurrentVersions(dir, dependencies);

    expect(react).toMatchObject({ current: '16.14.0', currentSource: 'lockfile' });
  });

  it('finds an aliased package by its alias folder', async () => {
    const dir = await tempProject({
      'node_modules/legacy/package.json': { name: 'react-select', version: '4.3.1' },
    });
    const { dependencies } = listRegistryDependencies({ dependencies: { legacy: 'npm:react-select@^4.0.0' } });

    const [legacy] = await resolveCurrentVersions(dir, dependencies);

    expect(legacy).toMatchObject({ registryName: 'react-select', current: '4.3.1', currentSource: 'node_modules' });
  });
});

describe('readManifest', () => {
  it('throws a typed error when there is no package.json', async () => {
    const dir = await tempProject({});

    await expect(readManifest(dir)).rejects.toBeInstanceOf(ManifestNotFoundError);
  });
});
