const { render, unmountComponentAtNode: unmount } = require('react-dom');

export function mountWidget(container, element) {
  render(element, container);
  return () => unmount(container);
}
