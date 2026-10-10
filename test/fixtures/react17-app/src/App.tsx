import React, { FC, PropsWithChildren } from 'react';

interface CardProps {
  title: string;
}

// Reads children that CardProps never declares.
export const Card: React.FC<CardProps> = ({ title, children }) => (
  <section>
    <h2>{title}</h2>
    {children}
  </section>
);

// Bare FC, children read through props.
export const Panel: FC = (props) => <div className="panel">{props.children}</div>;

interface ListProps {
  children?: React.ReactNode;
}

// Fine: children is declared.
export const List: React.FC<ListProps> = ({ children }) => <ul>{children}</ul>;

// Fine once @types/react is installed; unresolvable here, so it must stay quiet.
export const Wrapper: FC<PropsWithChildren<CardProps>> = ({ children }) => <div>{children}</div>;

// Fine: never touches children.
export const Label: FC<CardProps> = ({ title }) => <span>{title}</span>;

export function App() {
  return (
    <Card title="Hello">
      <List>
        <li>one</li>
      </List>
    </Card>
  );
}
