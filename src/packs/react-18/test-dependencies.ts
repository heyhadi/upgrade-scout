import semver from 'semver';
import type { ResolvedDependency } from '../../manifest.js';
import { findingInManifest } from '../../scan/finding.js';
import type { Finding, Rule } from '../types.js';

export const enzyme: Rule = {
  id: 'react-18/enzyme',
  severity: 'must-fix',
  title: 'Enzyme has no React 18 adapter',
  docsUrl: 'https://testing-library.com/docs/react-testing-library/migrate-from-enzyme',
  async check(context) {
    return context.dependencies
      .filter((dependency) => dependency.registryName === 'enzyme' || /enzyme-adapter-react/.test(dependency.registryName))
      .map((dependency) =>
        findingInManifest(
          enzyme,
          context.manifestText,
          dependency.name,
          dependency.registryName === 'enzyme'
            ? 'Enzyme has no official React 18 adapter; tests that mount components will fail. Migrate them to React Testing Library before (or alongside) the upgrade.'
            : `${dependency.registryName} only supports React ≤17; it goes away with the Enzyme migration.`,
        ),
      );
  },
};

export const testingLibraryVersions: Rule = {
  id: 'react-18/testing-library-versions',
  severity: 'must-fix',
  title: 'Test renderers must match React 18',
  docsUrl: 'https://github.com/testing-library/react-testing-library/releases/tag/v13.0.0',
  async check(context) {
    const findings: Finding[] = [];
    for (const dependency of context.dependencies) {
      const message = testRendererProblem(dependency);
      if (message) findings.push(findingInManifest(testingLibraryVersions, context.manifestText, dependency.name, message));
    }
    return findings;
  },
};

function testRendererProblem(dependency: ResolvedDependency): string | null {
  const major = dependency.current ? semver.major(dependency.current) : null;
  if (major === null) return null;
  switch (dependency.registryName) {
    case '@testing-library/react':
      return major < 13
        ? `@testing-library/react ${dependency.current} renders with ReactDOM.render; v13+ is required for React 18 (it uses createRoot).`
        : null;
    case 'react-test-renderer':
      return major < 18 ? `react-test-renderer must be on the same major as react; bump it to 18 with react.` : null;
    case '@testing-library/react-hooks':
      return '@testing-library/react-hooks does not support React 18; use renderHook from @testing-library/react 13.1+.';
    default:
      return null;
  }
}
