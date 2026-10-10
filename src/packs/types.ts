import type { Project } from 'ts-morph';
import type { ResolvedDependency } from '../manifest.js';

export type Severity = 'must-fix' | 'review';

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  /** Path relative to the project root, with forward slashes. */
  file: string;
  line: number;
  column: number;
  snippet?: string;
}

export interface ScanContext {
  projectDir: string;
  /** Source files of the scanned project. Created lazily so manifest-only packs stay fast. */
  getProject(): Promise<Project>;
  dependencies: ResolvedDependency[];
  manifestText: string;
}

export interface Rule {
  id: string;
  severity: Severity;
  title: string;
  docsUrl: string;
  check(context: ScanContext): Promise<Finding[]>;
}

export interface RulePack {
  id: string;
  title: string;
  /** Package whose upgrade this pack prepares for. */
  packageName: string;
  targetMajor: number;
  /** Whether the pack has anything to say at this version of `packageName`. */
  appliesTo(currentVersion: string): boolean;
  rules: Rule[];
}
