import { findingAt } from '../../scan/finding.js';
import { findModuleCalls } from '../../scan/module-bindings.js';
import type { Rule } from '../types.js';

export const renderToNodeStream: Rule = {
  id: 'react-18/render-to-node-stream',
  severity: 'review',
  title: 'renderToNodeStream is deprecated',
  docsUrl: 'https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-server-rendering-apis',
  async check(context) {
    const project = await context.getProject();
    return project
      .getSourceFiles()
      .flatMap((sourceFile) => findModuleCalls(sourceFile, ['react-dom/server'], ['renderToNodeStream']))
      .map(({ call }) =>
        findingAt(
          renderToNodeStream,
          call,
          context.projectDir,
          'renderToNodeStream() is deprecated in React 18 and buffers Suspense boundaries. Switch to renderToPipeableStream().',
        ),
      );
  },
};

export const unstableBatchedUpdates: Rule = {
  id: 'react-18/unstable-batched-updates',
  severity: 'review',
  title: 'unstable_batchedUpdates is redundant with automatic batching',
  docsUrl: 'https://react.dev/blog/2022/03/08/react-18-upgrade-guide#automatic-batching',
  async check(context) {
    const project = await context.getProject();
    return project
      .getSourceFiles()
      .flatMap((sourceFile) => findModuleCalls(sourceFile, ['react-dom', 'react-dom/client'], ['unstable_batchedUpdates']))
      .map(({ call }) =>
        findingAt(
          unstableBatchedUpdates,
          call,
          context.projectDir,
          'React 18 batches updates everywhere, so this wrapper is no longer needed. Check nearby code that relied on updates NOT being batched (reads right after setState in timeouts or promises).',
        ),
      );
  },
};
