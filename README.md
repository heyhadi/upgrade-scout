# upgrade-scout

See which dependencies are a major version behind, and what in your code will break when you upgrade them.

```sh
npx upgrade-scout
```

```
upgrade-scout my-app  (24 dependencies, checked against registry.npmjs.org)

Node
  .nvmrc 16 → Node 16  EOL since 2023-09-11

Behind a major (3)
  package                 current  latest  behind  rule pack
  @testing-library/react  12.1.5   16.3.0  4
  react                   17.0.2   19.2.0  2       react-18: 9 must-fix, 2 review
  react-dom               17.0.2   19.2.0  2

React 18 readiness (react 17.0.2 → 18)  9 must-fix, 2 review

  must-fix  ReactDOM.render / hydrate keep the app in React 17 mode (2)
            https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-client-rendering-apis
            src/index.tsx:4:1  ReactDOM.render(<App />, document.getElementById('root'))
  ...
```

## What it checks

- **Majors behind.** Each dependency's current version is read from `node_modules` first, then from `package-lock.json`, and as a last resort from the bottom of its range (shown as `~1.2.3`). That version is compared with the registry's `latest` tag. Below 1.0, each minor release counts as a major. `npm:` aliases are looked up under their real name. `workspace:`, `file:` and git dependencies are skipped.
- **Node end of life.** Checks `.nvmrc`, `.node-version` and the lowest version that `engines.node` allows.
- **Rule packs.** Code checks that run when the package they cover is installed below the pack's target:

| Pack | Rule | Severity |
| --- | --- | --- |
| react-18 | `ReactDOM.render` / `hydrate` (legacy root) | must-fix |
| | `unmountComponentAtNode` | must-fix |
| | `React.FC` components reading undeclared `children` (type-checked) | must-fix |
| | Enzyme and its React adapters | must-fix |
| | `@testing-library/react` < 13, `react-test-renderer` < 18, `@testing-library/react-hooks` | must-fix |
| | `renderToNodeStream` | review |
| | `unstable_batchedUpdates` | review |

Rules find imports through default, namespace, named, aliased and `require` bindings. A local function that happens to be called `render` is not flagged.

## Options

```
--cwd <dir>        Project to scan (default: current directory)
--json             Machine-readable output (schemaVersion 1)
--all              Also list dependencies that are current or minor/patch behind
--verbose          Every finding, with its explanation
--offline          Don't query the registry
--registry <url>   Registry to query (default: $npm_config_registry or registry.npmjs.org)
```

If you run it on a private codebase, use `--offline` or point `--registry` at your own mirror so package names aren't sent to the public registry.

## Development

```sh
npm install
npm test          # Vitest: unit tests + a React 17 fixture project
npm run build     # tsc → dist/
node dist/bin.js --cwd test/fixtures/react17-app --offline
```

Requires Node 22+.

## License

MIT
