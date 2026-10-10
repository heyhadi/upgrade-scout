import { existsSync } from 'node:fs';
import path from 'node:path';
import { Project, ts } from 'ts-morph';

const SOURCE_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

const IGNORED_DIRECTORIES = ['node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.output', '.git'];

/**
 * Loads the project's source files. The project's tsconfig supplies compiler options (paths,
 * jsx) so types resolve the way the project's own build sees them, but the file list is ours:
 * tsconfigs often leave out tests and scripts, which still break on upgrade.
 */
export function createScanProject(projectDir: string): Project {
  const tsConfigFilePath = path.join(projectDir, 'tsconfig.json');
  const project = existsSync(tsConfigFilePath)
    ? new Project({
        tsConfigFilePath,
        skipAddingFilesFromTsConfig: true,
        compilerOptions: { allowJs: true, noEmit: true },
      })
    : new Project({
        compilerOptions: {
          allowJs: true,
          jsx: ts.JsxEmit.Preserve,
          noEmit: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
      });

  project.addSourceFilesAtPaths([
    path.join(projectDir, SOURCE_GLOB),
    ...IGNORED_DIRECTORIES.map((directory) => `!${path.join(projectDir, '**', directory, '**')}`),
    `!${path.join(projectDir, '**/*.d.ts')}`,
  ]);
  return project;
}
