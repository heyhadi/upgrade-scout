import path from 'node:path';
import type { Node } from 'ts-morph';
import type { Finding, Rule } from '../packs/types.js';

const SNIPPET_LENGTH = 80;

export function findingAt(rule: Rule, node: Node, projectDir: string, message: string): Finding {
  const sourceFile = node.getSourceFile();
  const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
  return {
    ruleId: rule.id,
    severity: rule.severity,
    message,
    file: toProjectPath(projectDir, sourceFile.getFilePath()),
    line,
    column,
    snippet: snippetOf(node.getText()),
  };
}

/** Points at a dependency's key in package.json so editors can jump to it. */
export function findingInManifest(rule: Rule, manifestText: string, dependencyName: string, message: string): Finding {
  const lines = manifestText.split('\n');
  const index = lines.findIndex((line) => line.includes(`"${dependencyName}"`));
  return {
    ruleId: rule.id,
    severity: rule.severity,
    message,
    file: 'package.json',
    line: index + 1 || 1,
    column: index >= 0 ? lines[index]!.indexOf('"') + 1 : 1,
    snippet: index >= 0 ? snippetOf(lines[index]!.trim().replace(/,$/, '')) : undefined,
  };
}

export function toProjectPath(projectDir: string, filePath: string): string {
  return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function snippetOf(text: string): string {
  const firstLine = text.split('\n')[0]!.trim();
  return firstLine.length > SNIPPET_LENGTH ? `${firstLine.slice(0, SNIPPET_LENGTH - 1)}…` : firstLine;
}
