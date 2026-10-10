export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';

export interface RegistryOptions {
  registryUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
}

export type LatestVersionLookup =
  | { name: string; ok: true; latest: string }
  | { name: string; ok: false; error: string };

/** Honors `npm_config_registry`, which npm sets for scripts and users set for mirrors. */
export function registryUrlFromEnv(env: NodeJS.ProcessEnv): string {
  return env.npm_config_registry || DEFAULT_REGISTRY_URL;
}

export function packageUrl(registryUrl: string, name: string): string {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;
  // Scoped names keep the `@` but must encode the slash: @scope%2fname.
  return base + name.replace('/', '%2f');
}

export async function fetchLatestVersion(name: string, options: RegistryOptions): Promise<LatestVersionLookup> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(packageUrl(options.registryUrl, name), {
      // The abbreviated document is a fraction of the full packument and still has dist-tags.
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!response.ok) {
      return { name, ok: false, error: response.status === 404 ? 'not found in registry' : `HTTP ${response.status}` };
    }
    const document = (await response.json()) as { 'dist-tags'?: { latest?: unknown } };
    const latest = document['dist-tags']?.latest;
    if (typeof latest !== 'string') return { name, ok: false, error: 'no latest dist-tag' };
    return { name, ok: true, latest };
  } catch (error) {
    return { name, ok: false, error: describeFetchError(error) };
  }
}

export async function fetchLatestVersions(
  names: string[],
  options: RegistryOptions,
): Promise<Map<string, LatestVersionLookup>> {
  const unique = [...new Set(names)];
  const results = await mapWithConcurrency(unique, options.concurrency ?? 8, (name) =>
    fetchLatestVersion(name, options),
  );
  return new Map(results.map((result) => [result.name, result]));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function describeFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timed out';
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}
