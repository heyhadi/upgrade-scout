import { type CallExpression, Node, type SourceFile, SyntaxKind } from 'ts-morph';

export interface ModuleBindings {
  /** Local names bound to the whole module: default, `* as`, or `const x = require(...)`. */
  namespaces: Set<string>;
  /** Local name → exported name, from named imports and destructured requires. */
  named: Map<string, string>;
}

/** Collects every local identifier that refers to one of `moduleNames` or its exports. */
export function getModuleBindings(sourceFile: SourceFile, moduleNames: readonly string[]): ModuleBindings {
  const namespaces = new Set<string>();
  const named = new Map<string, string>();

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!moduleNames.includes(declaration.getModuleSpecifierValue())) continue;
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) namespaces.add(defaultImport.getText());
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) namespaces.add(namespaceImport.getText());
    for (const specifier of declaration.getNamedImports()) {
      named.set(specifier.getAliasNode()?.getText() ?? specifier.getName(), specifier.getName());
    }
  }

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (!initializer || !isRequireOf(initializer, moduleNames)) continue;
    const nameNode = declaration.getNameNode();
    if (Node.isIdentifier(nameNode)) {
      namespaces.add(nameNode.getText());
    } else if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const exported = element.getPropertyNameNode()?.getText() ?? element.getName();
        named.set(element.getName(), exported);
      }
    }
  }

  return { namespaces, named };
}

export interface ModuleCall {
  exportName: string;
  call: CallExpression;
}

/** Finds calls like `ReactDOM.render(...)` or `render(...)` that resolve to a module export. */
export function findModuleCalls(
  sourceFile: SourceFile,
  moduleNames: readonly string[],
  exportNames: readonly string[],
): ModuleCall[] {
  // Most files never mention the module; skip walking their AST.
  const text = sourceFile.getFullText();
  if (!moduleNames.some((moduleName) => text.includes(moduleName))) return [];

  const bindings = getModuleBindings(sourceFile, moduleNames);
  if (bindings.namespaces.size === 0 && bindings.named.size === 0) return [];

  const calls: ModuleCall[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exportName = resolveExportReference(call.getExpression(), bindings);
    if (exportName && exportNames.includes(exportName)) calls.push({ exportName, call });
  }
  return calls;
}

/** `ns.member` → member if `ns` is the module; `local` → its export name if it was imported. */
export function resolveExportReference(node: Node, bindings: ModuleBindings): string | null {
  if (Node.isPropertyAccessExpression(node)) {
    const target = node.getExpression();
    return Node.isIdentifier(target) && bindings.namespaces.has(target.getText()) ? node.getName() : null;
  }
  if (Node.isIdentifier(node)) return bindings.named.get(node.getText()) ?? null;
  return null;
}

function isRequireOf(node: Node, moduleNames: readonly string[]): boolean {
  if (!Node.isCallExpression(node)) return false;
  if (node.getExpression().getText() !== 'require') return false;
  const [argument] = node.getArguments();
  return Node.isStringLiteral(argument) && moduleNames.includes(argument.getLiteralValue());
}
