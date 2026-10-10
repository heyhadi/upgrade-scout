import { describe, expect, it } from 'vitest';
import { checkNodeVersions, nodeSupportStatus, parseNodeVersionFile } from '../src/node-eol.js';
import { tempProject } from './helpers/temp-project.js';

const NOW = new Date('2026-10-10T00:00:00Z');

describe('nodeSupportStatus', () => {
  it.each([
    [8, 'eol'],
    [16, 'eol'],
    [20, 'eol'],
    [22, 'supported'],
    [24, 'supported'],
    [99, 'unknown'],
  ])('Node %i is %s', (major, status) => {
    expect(nodeSupportStatus(major, NOW).status).toBe(status);
  });

  it('warns six months before end of life', () => {
    expect(nodeSupportStatus(22, new Date('2026-11-01T00:00:00Z')).status).toBe('eol-soon');
  });
});

describe('parseNodeVersionFile', () => {
  it.each([
    ['18\n', 18],
    ['v20.11.1', 20],
    ['lts/hydrogen', 18],
    ['# pinned\nlts/jod', 22],
    ['lts/*', null],
    ['node', null],
  ])('%j → %s', (contents, expected) => {
    expect(parseNodeVersionFile(contents)).toBe(expected);
  });
});

describe('checkNodeVersions', () => {
  it('checks .nvmrc, .node-version and the floor of engines.node', async () => {
    const dir = await tempProject({ '.nvmrc': '16\n', '.node-version': '24.1.0' });

    const checks = await checkNodeVersions(dir, { engines: { node: '>=18 <23' } }, NOW);

    expect(checks).toEqual([
      { source: '.nvmrc', declared: '16', major: 16, status: 'eol', endOfLife: '2023-09-11' },
      { source: '.node-version', declared: '24.1.0', major: 24, status: 'supported', endOfLife: '2028-04-30' },
      { source: 'engines.node', declared: '>=18 <23', major: 18, status: 'eol', endOfLife: '2025-04-30' },
    ]);
  });

  it('returns nothing when the project does not pin Node', async () => {
    const dir = await tempProject({});

    await expect(checkNodeVersions(dir, {}, NOW)).resolves.toEqual([]);
  });
});
