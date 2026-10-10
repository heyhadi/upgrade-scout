import {
  type ArrowFunction,
  type FunctionExpression,
  Node,
  type SourceFile,
  SyntaxKind,
  type TypeNode,
  type VariableDeclaration,
} from 'ts-morph';
import { findingAt } from '../../scan/finding.js';
import { getModuleBindings, type ModuleBindings } from '../../scan/module-bindings.js';
import type { Finding, Rule } from '../types.js';

const FUNCTION_COMPONENT_TYPES = ['FC', 'FunctionComponent'];
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;

export const fcImplicitChildren: Rule = {
  id: 'react-18/fc-implicit-children',
  severity: 'must-fix',
  title: 'React.FC no longer includes children (@types/react 18)',
  docsUrl: 'https://react.dev/blog/2022/03/08/react-18-upgrade-guide#updates-to-typescript-definitions',
  async check(context) {
    const project = await context.getProject();
    const findings: Finding[] = [];
    for (const sourceFile of project.getSourceFiles()) {
      if (!TYPESCRIPT_FILE.test(sourceFile.getFilePath())) continue;
      if (!/\bFC\b|\bFunctionComponent\b/.test(sourceFile.getFullText())) continue;
      const bindings = reactBindings(sourceFile);
      for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const propsType = functionComponentPropsType(declaration, bindings);
        if (propsType === undefined) continue;
        const component = declaration.getInitializer();
        if (!Node.isArrowFunction(component) && !Node.isFunctionExpression(component)) continue;
        if (!readsChildren(component) || declaresChildren(propsType)) continue;
        findings.push(
          findingAt(
            fcImplicitChildren,
            declaration,
            context.projectDir,
            `${declaration.getName()} reads children, but React.FC stops adding it in @types/react 18. Add \`children?: React.ReactNode\` to its props (or wrap them in PropsWithChildren).`,
          ),
        );
      }
    }
    return findings;
  },
};

function reactBindings(sourceFile: SourceFile): ModuleBindings {
  const bindings = getModuleBindings(sourceFile, ['react']);
  // @types/react declares a global `React` namespace, so `React.FC` type-checks without an import
  // in projects on the new JSX transform.
  bindings.namespaces.add('React');
  return bindings;
}

/**
 * For `const X: React.FC<Props> = ...` returns the `Props` node, `null` for a bare `React.FC`,
 * and `undefined` when the declaration isn't typed as a function component at all.
 */
function functionComponentPropsType(declaration: VariableDeclaration, bindings: ModuleBindings): TypeNode | null | undefined {
  const typeNode = declaration.getTypeNode();
  if (!Node.isTypeReference(typeNode)) return undefined;

  const typeName = typeNode.getTypeName();
  const referenced = Node.isQualifiedName(typeName)
    ? Node.isIdentifier(typeName.getLeft()) && bindings.namespaces.has(typeName.getLeft().getText())
      ? typeName.getRight().getText()
      : null
    : bindings.named.get(typeName.getText());
  if (!referenced || !FUNCTION_COMPONENT_TYPES.includes(referenced)) return undefined;

  return typeNode.getTypeArguments()[0] ?? null;
}

function readsChildren(component: ArrowFunction | FunctionExpression): boolean {
  const [propsParameter] = component.getParameters();
  if (!propsParameter) return false;

  const nameNode = propsParameter.getNameNode();
  if (Node.isObjectBindingPattern(nameNode)) return bindsChildren(nameNode.getElements());
  if (!Node.isIdentifier(nameNode)) return false;

  const propsName = nameNode.getText();
  const body = component.getBody();
  const accessesChildren = body
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .some((access) => access.getName() === 'children' && access.getExpression().getText() === propsName);
  if (accessesChildren) return true;

  // `const { children } = props;`
  return body.getDescendantsOfKind(SyntaxKind.VariableDeclaration).some((declaration) => {
    const pattern = declaration.getNameNode();
    return (
      Node.isObjectBindingPattern(pattern) &&
      declaration.getInitializer()?.getText() === propsName &&
      bindsChildren(pattern.getElements())
    );
  });
}

function bindsChildren(elements: { getPropertyNameNode(): Node | undefined; getName(): string }[]): boolean {
  return elements.some((element) => (element.getPropertyNameNode()?.getText() ?? element.getName()) === 'children');
}

function declaresChildren(propsType: TypeNode | null): boolean {
  if (propsType === null) return false;
  const type = propsType.getType();
  // Unresolvable types (e.g. @types/react not installed) — don't guess, stay quiet.
  if (type.isAny() || type.isUnknown()) return true;
  return type.getProperty('children') !== undefined;
}
