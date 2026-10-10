#!/usr/bin/env node
import { main } from './cli.js';

main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() }).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    process.stderr.write(`upgrade-scout crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  },
);
