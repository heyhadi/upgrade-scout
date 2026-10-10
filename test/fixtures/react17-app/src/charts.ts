// Same export names from other libraries must not be flagged.
import { render } from './chart-renderer';
import { hydrate } from 'some-ssr-lib';

render('#chart');
hydrate('#app');
