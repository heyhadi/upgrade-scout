import { renderToNodeStream } from 'react-dom/server';

export const streamPage = (element: any) => renderToNodeStream(element);
