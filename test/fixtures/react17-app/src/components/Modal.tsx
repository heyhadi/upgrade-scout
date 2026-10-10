import type { FunctionComponent } from 'react';

type ModalProps = { open: boolean };

export const Modal: FunctionComponent<ModalProps> = function Modal(props) {
  const { children } = props;
  return props.open ? <div role="dialog">{children}</div> : null;
};
