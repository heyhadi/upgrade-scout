import type { OverviewResult } from '../overview.js';

/** Bump when a field is removed or changes meaning; adding fields is not breaking. */
export const JSON_SCHEMA_VERSION = 1;

export function formatOverviewJson(result: OverviewResult): string {
  return `${JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, ...result }, null, 2)}\n`;
}
