import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ManifestNotFoundError } from './manifest.js';
import { runOverview } from './overview.js';
import { registryUrlFromEnv } from './registry.js';
import { formatOverviewJson } from './report/json.js';
import { formatOverview } from './report/terminal.js';

export interface CliIo {
  stdout: { write(text: string): void; isTTY?: boolean };
  stderr: { write(text: string): void };
  env: NodeJS.ProcessEnv;
  cwd: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

const HELP = `Usage: upgrade-scout [options]

Shows which dependencies are a major behind and what a rule pack finds in your code.

Options:
  --cwd <dir>        Project to scan (default: current directory)
  --json             Print machine-readable JSON
  --all              Also list dependencies that are current or minor/patch behind
  --verbose          List every finding, with its explanation
  --offline          Don't query the npm registry
  --registry <url>   Registry to query (default: $npm_config_registry or registry.npmjs.org)
  --no-color         Disable colors (NO_COLOR is honored too)
  -v, --version      Print the version
  -h, --help         Show this help
`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        cwd: { type: 'string' },
        json: { type: 'boolean' },
        all: { type: 'boolean' },
        verbose: { type: 'boolean' },
        offline: { type: 'boolean' },
        registry: { type: 'string' },
        color: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    io.stderr.write(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (positionals.length > 0) {
    io.stderr.write(`Deep audits like \`upgrade-scout ${positionals[0]}\` aren't available yet. Run without arguments for the overview.\n`);
    return 2;
  }

  const projectDir = path.resolve(io.cwd, values.cwd ?? '.');
  try {
    const result = await runOverview({
      projectDir,
      registry: values.offline
        ? null
        : { registryUrl: values.registry ?? registryUrlFromEnv(io.env), fetchImpl: io.fetchImpl },
      now: io.now ?? new Date(),
    });
    io.stdout.write(
      values.json
        ? formatOverviewJson(result)
        : formatOverview(result, {
            color: useColor(values, io),
            all: values.all ?? false,
            verbose: values.verbose ?? false,
          }),
    );
    return 0;
  } catch (error) {
    if (error instanceof ManifestNotFoundError) {
      io.stderr.write(`${error.message}. Run upgrade-scout from a project root or pass --cwd.\n`);
      return 1;
    }
    throw error;
  }
}

function useColor(values: { color?: boolean; 'no-color'?: boolean }, io: CliIo): boolean {
  if (values['no-color'] || io.env.NO_COLOR) return false;
  if (values.color || io.env.FORCE_COLOR) return true;
  return io.stdout.isTTY === true;
}

function readVersion(): string {
  // Same relative path from src/ (tests) and dist/ (published).
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return manifest.version;
}
