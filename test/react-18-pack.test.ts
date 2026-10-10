import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRegistryDependencies, readManifest, resolveCurrentVersions } from '../src/manifest.js';
import { react18Pack } from '../src/packs/react-18/index.js';
import type { Finding, ScanContext } from '../src/packs/types.js';
import { createScanProject } from '../src/scan/project.js';
import { tempProject } from './helpers/temp-project.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/react17-app');

async function scanContext(projectDir: string): Promise<ScanContext> {
  const { manifest, text } = await readManifest(projectDir);
  const dependencies = await resolveCurrentVersions(projectDir, listRegistryDependencies(manifest).dependencies);
  const project = createScanProject(projectDir);
  return { projectDir, dependencies, manifestText: text, getProject: async () => project };
}

async function findingsFor(ruleId: string, projectDir = FIXTURE): Promise<Finding[]> {
  const rule = react18Pack.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`no rule ${ruleId}`);
  return rule.check(await scanContext(projectDir));
}

const locations = (findings: Finding[]) => findings.map((finding) => `${finding.file}:${finding.line}`);

describe('react-18 pack', () => {
  it('applies below React 19', () => {
    expect(react18Pack.appliesTo('17.0.2')).toBe(true);
    expect(react18Pack.appliesTo('18.3.1')).toBe(true);
    expect(react18Pack.appliesTo('19.0.0')).toBe(false);
  });

  it('flags ReactDOM.render through default imports and destructured requires, but not lookalikes', async () => {
    const findings = await findingsFor('react-18/legacy-root-api');

    expect(locations(findings)).toEqual(['src/index.tsx:4', 'src/legacy-widget.js:4']);
    expect(findings[0]!.message).toContain('callback argument');
    expect(findings[1]!.message).not.toContain('callback argument');
  });

  it('flags unmountComponentAtNode even when renamed', async () => {
    const findings = await findingsFor('react-18/unmount-component-at-node');

    expect(locations(findings)).toEqual(['src/legacy-widget.js:5']);
    expect(findings[0]!.snippet).toBe('unmount(container)');
  });

  it('flags function components that read undeclared children', async () => {
    const findings = await findingsFor('react-18/fc-implicit-children');

    expect(findings.map((finding) => finding.snippet?.split(':')[0])).toEqual(['Card', 'Panel', 'Modal']);
    expect(locations(findings)).toEqual(['src/App.tsx:8', 'src/App.tsx:16', 'src/components/Modal.tsx:5']);
  });

  it('flags deprecated server streaming and redundant batching', async () => {
    expect(locations(await findingsFor('react-18/render-to-node-stream'))).toEqual(['src/server.ts:3']);
    expect(locations(await findingsFor('react-18/unstable-batched-updates'))).toEqual(['src/store.ts:4']);
  });

  it('points at Enzyme and outdated test renderers in package.json', async () => {
    const enzyme = await findingsFor('react-18/enzyme');
    const renderers = await findingsFor('react-18/testing-library-versions');

    expect(enzyme.map((finding) => finding.snippet)).toEqual([
      '"@wojtekmaj/enzyme-adapter-react-17": "^0.6.7"',
      '"enzyme": "^3.11.0"',
    ]);
    expect(renderers).toHaveLength(1);
    expect(renderers[0]).toMatchObject({ file: 'package.json', line: 15 });
    expect(renderers[0]!.message).toContain('12.1.5');
  });

  it('accepts children declared through intersections and resolves imported prop types', async () => {
    const dir = await tempProject({
      'package.json': { dependencies: { react: '17.0.2' } },
      'src/types.ts': 'export interface WithChildren { children?: unknown }',
      'src/Box.tsx': `
        import * as React from 'react';
        import type { WithChildren } from './types';
        type BoxProps = { padding: number } & WithChildren;
        export const Box: React.FC<BoxProps> = ({ children }) => <div>{children}</div>;
      `,
    });

    await expect(findingsFor('react-18/fc-implicit-children', dir)).resolves.toEqual([]);
  });

  it('understands React.FC without an import (global namespace) and skips plain JS files', async () => {
    const dir = await tempProject({
      'package.json': { dependencies: { react: '17.0.2' } },
      'src/Tag.tsx': 'export const Tag: React.FC<{ label: string }> = ({ children }) => <b>{children}</b>;',
      'src/Plain.jsx': 'export const Plain = ({ children }) => <i>{children}</i>;',
    });

    expect(locations(await findingsFor('react-18/fc-implicit-children', dir))).toEqual(['src/Tag.tsx:1']);
  });

  it('ignores node_modules and build output', async () => {
    const dir = await tempProject({
      'package.json': { dependencies: { react: '17.0.2' } },
      'node_modules/lib/index.js': "require('react-dom').render(null, null); const { render } = require('react-dom'); render();",
      'dist/main.js': "import ReactDOM from 'react-dom'; ReactDOM.render(null, null);",
      'src/main.js': "import ReactDOM from 'react-dom'; ReactDOM.render(null, null);",
    });

    expect(locations(await findingsFor('react-18/legacy-root-api', dir))).toEqual(['src/main.js:1']);
  });
});
