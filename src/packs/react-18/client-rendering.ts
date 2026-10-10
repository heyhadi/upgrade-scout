import { findingAt } from '../../scan/finding.js';
import { findModuleCalls } from '../../scan/module-bindings.js';
import type { Finding, Rule } from '../types.js';

const DOCS_URL = 'https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-client-rendering-apis';

export const legacyRootApi: Rule = {
  id: 'react-18/legacy-root-api',
  severity: 'must-fix',
  title: 'ReactDOM.render / hydrate keep the app in React 17 mode',
  docsUrl: DOCS_URL,
  async check(context) {
    const project = await context.getProject();
    const findings: Finding[] = [];
    for (const sourceFile of project.getSourceFiles()) {
      for (const { exportName, call } of findModuleCalls(sourceFile, ['react-dom'], ['render', 'hydrate'])) {
        const replacement = exportName === 'render' ? 'createRoot(container).render(element)' : 'hydrateRoot(container, element)';
        let message = `${exportName}() runs as a legacy root under React 18 (no concurrent features, warning in dev). Use ${replacement} from 'react-dom/client'.`;
        if (call.getArguments().length > 2) {
          message += ' The callback argument has no createRoot equivalent — move it into a ref callback or useEffect.';
        }
        findings.push(findingAt(legacyRootApi, call, context.projectDir, message));
      }
    }
    return findings;
  },
};

export const unmountComponentAtNode: Rule = {
  id: 'react-18/unmount-component-at-node',
  severity: 'must-fix',
  title: 'unmountComponentAtNode does not work on createRoot roots',
  docsUrl: DOCS_URL,
  async check(context) {
    const project = await context.getProject();
    return project
      .getSourceFiles()
      .flatMap((sourceFile) => findModuleCalls(sourceFile, ['react-dom'], ['unmountComponentAtNode']))
      .map(({ call }) =>
        findingAt(
          unmountComponentAtNode,
          call,
          context.projectDir,
          'unmountComponentAtNode() only unmounts legacy roots. Once the matching render() becomes createRoot(), keep the root and call root.unmount().',
        ),
      );
  },
};
