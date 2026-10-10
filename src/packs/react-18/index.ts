import semver from 'semver';
import type { RulePack } from '../types.js';
import { legacyRootApi, unmountComponentAtNode } from './client-rendering.js';
import { renderToNodeStream, unstableBatchedUpdates } from './deprecated-apis.js';
import { fcImplicitChildren } from './fc-implicit-children.js';
import { enzyme, testingLibraryVersions } from './test-dependencies.js';

export const react18Pack: RulePack = {
  id: 'react-18',
  title: 'React 18',
  packageName: 'react',
  targetMajor: 18,
  // On 18 the same patterns are leftovers worth flagging (legacy roots still run in 17 mode);
  // from 19 on they're compile errors the project has already dealt with.
  appliesTo: (currentVersion) => semver.major(currentVersion) < 19,
  rules: [
    legacyRootApi,
    unmountComponentAtNode,
    fcImplicitChildren,
    enzyme,
    testingLibraryVersions,
    renderToNodeStream,
    unstableBatchedUpdates,
  ],
};
