import * as ReactDOM from 'react-dom';

export function flushAll(updates: Array<() => void>) {
  ReactDOM.unstable_batchedUpdates(() => updates.forEach((update) => update()));
}
