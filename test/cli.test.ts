import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { fakeRegistry } from './helpers/fake-registry.js';
import { tempProject } from './helpers/temp-project.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/react17-app');
const NOW = new Date('2026-10-10T00:00:00Z');

const LATEST = {
  react: '19.2.0',
  'react-dom': '19.2.0',
  lodash: '4.17.21',
  '@acme/ui-kit': '4.0.1',
  '@testing-library/react': '16.3.0',
  '@wojtekmaj/enzyme-adapter-react-17': '0.8.0',
  enzyme: '3.11.0',
};

async function run(argv: string[], options: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {}) {
  let stdout = '';
  let stderr = '';
  const exitCode = await main(argv, {
    stdout: { write: (text) => void (stdout += text) },
    stderr: { write: (text) => void (stderr += text) },
    env: options.env ?? {},
    cwd: FIXTURE,
    fetchImpl: options.fetchImpl,
    now: NOW,
  });
  return { exitCode, stdout, stderr };
}

describe('upgrade-scout overview', () => {
  it('prints the overview for a React 17 project', async () => {
    const { fetchImpl, requested } = fakeRegistry(LATEST);

    const { exitCode, stdout } = await run([], { fetchImpl });

    expect(exitCode).toBe(0);
    // Aliases are looked up under their real name; workspace deps aren't looked up at all.
    expect(requested).toContain('@acme/ui-kit');
    expect(requested).not.toContain('shared');
    expect(stdout).toMatchInlineSnapshot(`
      "upgrade-scout react17-fixture  (8 dependencies, checked against registry.npmjs.org)

      Node
        .nvmrc 16 → Node 16  EOL since 2023-09-11
        engines.node >=14 → Node 14  EOL since 2023-04-30

      Behind a major (5)
        package                             current  latest  behind  rule pack
        @testing-library/react              12.1.5   16.3.0  4
        @wojtekmaj/enzyme-adapter-react-17  0.6.7    0.8.0   2
        react                               17.0.2   19.2.0  2       react-18: 9 must-fix, 2 review
        react-dom                           17.0.2   19.2.0  2
        ui-kit                              2.3.0    4.0.1   2
      2 more are current or only minor/patch behind (--all to list).

      Couldn't check (1)
        typescript  not found in registry
      Not from the registry: shared

      React 18 readiness (react 17.0.2 → 18)  9 must-fix, 2 review

        must-fix  ReactDOM.render / hydrate keep the app in React 17 mode (2)
                  https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-client-rendering-apis
                  src/index.tsx:4:1  ReactDOM.render(<App />, document.getElementById('root'), () => console.log('mo…
                  src/legacy-widget.js:4:3  render(element, container)

        must-fix  unmountComponentAtNode does not work on createRoot roots (1)
                  https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-client-rendering-apis
                  src/legacy-widget.js:5:16  unmount(container)

        must-fix  React.FC no longer includes children (@types/react 18) (3)
                  https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-typescript-definitions
                  src/App.tsx:8:14  Card: React.FC<CardProps> = ({ title, children }) => (
                  src/App.tsx:16:14  Panel: FC = (props) => <div className="panel">{props.children}</div>
                  src/components/Modal.tsx:5:14  Modal: FunctionComponent<ModalProps> = function Modal(props) {

        must-fix  Enzyme has no React 18 adapter (2)
                  https://testing-library.com/docs/react-testing-library/migrate-from-enzyme
                  package.json:16:5  "@wojtekmaj/enzyme-adapter-react-17": "^0.6.7"
                  package.json:17:5  "enzyme": "^3.11.0"

        must-fix  Test renderers must match React 18 (1)
                  https://github.com/testing-library/react-testing-library/releases/tag/v13.0.0
                  package.json:15:5  "@testing-library/react": "^12.1.5"

        review    renderToNodeStream is deprecated (1)
                  https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-server-rendering-apis
                  src/server.ts:3:45  renderToNodeStream(element)

        review    unstable_batchedUpdates is redundant with automatic batching (1)
                  https://react.dev/blog/2022/03/08/react-18-upgrade-guide#automatic-batching
                  src/store.ts:4:3  ReactDOM.unstable_batchedUpdates(() => updates.forEach((update) => update()))
      "
    `);
  });

  it('prints JSON with every finding', async () => {
    const { fetchImpl } = fakeRegistry({ ...LATEST, typescript: '6.0.3' });

    const { stdout } = await run(['--json'], { fetchImpl });
    const report = JSON.parse(stdout);

    expect(report.schemaVersion).toBe(1);
    expect(report.dependencies.find((dependency: { name: string }) => dependency.name === 'typescript')).toMatchObject({
      current: '4.9.5',
      latest: '6.0.3',
      majorsBehind: 2,
    });
    expect(report.packs[0]).toMatchObject({ id: 'react-18', mustFix: 9, review: 2 });
    expect(report.packs[0].findings).toHaveLength(11);
  });

  it('runs packs without touching the network in --offline mode', async () => {
    const fetchImpl = (async () => {
      throw new Error('network used');
    }) as typeof fetch;

    const { exitCode, stdout } = await run(['--offline', '--no-color'], { fetchImpl });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('offline: registry not checked');
    expect(stdout).toContain('React 18 readiness');
  });

  it('skips the React pack once a project is on React 19', async () => {
    const dir = await tempProject({
      'package.json': { name: 'modern', dependencies: { react: '^19.0.0' } },
      'src/index.js': "import ReactDOM from 'react-dom'; ReactDOM.render(null, null);",
    });

    const { stdout } = await run(['--offline', '--json', '--cwd', dir]);

    expect(JSON.parse(stdout).packs).toEqual([]);
  });

  it('explains a missing package.json and exits 1', async () => {
    const dir = await tempProject({});

    const { exitCode, stderr } = await run(['--cwd', dir, '--offline']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('No package.json found');
  });

  it('rejects unknown flags and not-yet-built deep audits with exit 2', async () => {
    expect((await run(['--nope'])).exitCode).toBe(2);
    const deep = await run(['react@18']);
    expect(deep.exitCode).toBe(2);
    expect(deep.stderr).toContain("aren't available yet");
  });
});
