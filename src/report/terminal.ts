import { createColors } from 'picocolors';
import type { OverviewResult, PackResult } from '../overview.js';
import type { DependencyStatus } from '../outdated.js';
import type { NodeVersionCheck } from '../node-eol.js';

export interface TerminalReportOptions {
  color: boolean;
  /** Also list dependencies that are current or only behind on minor/patch. */
  all: boolean;
  /** List every finding instead of the first few per rule. */
  verbose: boolean;
}

const LOCATIONS_PER_RULE = 3;

type Colors = ReturnType<typeof createColors>;

export function formatOverview(result: OverviewResult, options: TerminalReportOptions): string {
  const c = createColors(options.color);
  const sections = [
    header(result, c),
    nodeSection(result.node, c),
    dependencySection(result, options, c),
    ...result.packs.map((pack) => packSection(pack, options, c)),
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

function header(result: OverviewResult, c: Colors): string {
  const name = result.projectName ?? result.projectDir;
  const source = result.registryUrl ? `checked against ${hostOf(result.registryUrl)}` : 'offline: registry not checked';
  return `${c.bold('upgrade-scout')} ${name}  ${c.dim(`(${result.dependencies.length} dependencies, ${source})`)}`;
}

function nodeSection(checks: NodeVersionCheck[], c: Colors): string {
  const notable = checks.filter((check) => check.status === 'eol' || check.status === 'eol-soon');
  if (notable.length === 0) return '';
  const rows = notable.map((check) => {
    const when = check.endOfLife ? (check.status === 'eol' ? `EOL since ${check.endOfLife}` : `EOL on ${check.endOfLife}`) : 'EOL';
    const label = check.status === 'eol' ? c.red(when) : c.yellow(when);
    return `  ${check.source} ${c.dim(check.declared)} → Node ${check.major}  ${label}`;
  });
  return [c.bold('Node'), ...rows].join('\n');
}

function dependencySection(result: OverviewResult, options: TerminalReportOptions, c: Colors): string {
  const behind = result.dependencies
    .filter((dependency) => (dependency.majorsBehind ?? 0) > 0)
    .sort((a, b) => b.majorsBehind! - a.majorsBehind! || a.name.localeCompare(b.name));
  const failed = result.dependencies.filter((dependency) => dependency.lookupError);
  const lines: string[] = [];

  if (!result.registryUrl) {
    lines.push(c.dim('Skipped the registry (--offline), so no "behind" counts.'));
  } else if (behind.length === 0) {
    lines.push(c.green('No dependency is a major behind.'));
  } else {
    lines.push(c.bold(`Behind a major (${behind.length})`));
    lines.push(...dependencyTable(behind, result.packs, c));
  }

  if (options.all && result.registryUrl) {
    const rest = result.dependencies.filter((dependency) => dependency.majorsBehind === 0);
    if (rest.length > 0) {
      lines.push('', c.bold(`Current or minor/patch behind (${rest.length})`), ...dependencyTable(rest, [], c));
    }
  } else if (result.registryUrl) {
    const restCount = result.dependencies.filter((dependency) => dependency.majorsBehind === 0).length;
    if (restCount > 0) lines.push(c.dim(`${restCount} more are current or only minor/patch behind (--all to list).`));
  }

  if (failed.length > 0) {
    lines.push('', c.bold(`Couldn't check (${failed.length})`));
    lines.push(...failed.map((dependency) => `  ${dependency.name}  ${c.dim(dependency.lookupError!)}`));
  }
  if (result.skipped.length > 0) {
    lines.push(c.dim(`Not from the registry: ${result.skipped.map((skipped) => skipped.name).join(', ')}`));
  }
  return lines.join('\n');
}

function dependencyTable(dependencies: DependencyStatus[], packs: PackResult[], c: Colors): string[] {
  const rows = dependencies.map((dependency) => {
    const pack = packs.find((candidate) => candidate.packageName === dependency.registryName);
    return [
      dependency.name,
      formatCurrent(dependency),
      dependency.latest ?? '?',
      dependency.majorsBehind ? `${dependency.majorsBehind}` : '-',
      pack ? `${pack.id}: ${pack.mustFix} must-fix, ${pack.review} review` : '',
    ];
  });
  const table = alignColumns([['package', 'current', 'latest', 'behind', 'rule pack'], ...rows]);
  return table.map((line, index) => (index === 0 ? c.dim(`  ${line}`) : `  ${line}`));
}

function formatCurrent(dependency: DependencyStatus): string {
  if (!dependency.current) return '?';
  // A version read from the range is a guess; mark it so nobody trusts it like an installed one.
  return dependency.currentSource === 'range' ? `~${dependency.current}` : dependency.current;
}

function packSection(pack: PackResult, options: TerminalReportOptions, c: Colors): string {
  const summary =
    pack.findings.length === 0
      ? c.green('nothing found')
      : `${c.red(`${pack.mustFix} must-fix`)}, ${c.yellow(`${pack.review} review`)}`;
  const lines = [`${c.bold(`${pack.title} readiness`)} ${c.dim(`(${pack.packageName} ${pack.currentVersion} → ${pack.targetMajor})`)}  ${summary}`];

  for (const rule of pack.rules) {
    const findings = pack.findings.filter((finding) => finding.ruleId === rule.id);
    if (findings.length === 0) continue;
    const severity = rule.severity === 'must-fix' ? c.red('must-fix') : c.yellow('review  ');
    lines.push('', `  ${severity}  ${rule.title} ${c.dim(`(${findings.length})`)}`);
    lines.push(`            ${c.dim(rule.docsUrl)}`);
    if (options.verbose) lines.push(`            ${findings[0]!.message}`);

    const shown = options.verbose ? findings : findings.slice(0, LOCATIONS_PER_RULE);
    for (const finding of shown) {
      lines.push(`            ${c.cyan(`${finding.file}:${finding.line}:${finding.column}`)}  ${c.dim(finding.snippet ?? '')}`);
    }
    if (shown.length < findings.length) {
      lines.push(c.dim(`            …and ${findings.length - shown.length} more (--verbose)`));
    }
  }
  return lines.join('\n');
}

function alignColumns(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd());
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
