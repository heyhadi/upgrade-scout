import { describe, expect, it } from 'vitest';
import { fetchLatestVersion, fetchLatestVersions, packageUrl, registryUrlFromEnv } from '../src/registry.js';
import { fakeRegistry } from './helpers/fake-registry.js';

const REGISTRY = 'https://registry.example.test/';

describe('packageUrl', () => {
  it('encodes the slash of scoped packages and tolerates a missing trailing slash', () => {
    expect(packageUrl('https://registry.npmjs.org/', 'react')).toBe('https://registry.npmjs.org/react');
    expect(packageUrl('https://npm.example.test/repo', '@types/react')).toBe('https://npm.example.test/repo/@types%2freact');
  });
});

describe('registryUrlFromEnv', () => {
  it('uses npm_config_registry when set', () => {
    expect(registryUrlFromEnv({ npm_config_registry: 'https://mirror.test/' })).toBe('https://mirror.test/');
    expect(registryUrlFromEnv({})).toBe('https://registry.npmjs.org/');
  });
});

describe('fetchLatestVersion', () => {
  it('reads the latest dist-tag and asks for the abbreviated document', async () => {
    let accept: string | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      accept = new Headers(init?.headers).get('accept');
      return Response.json({ 'dist-tags': { latest: '19.2.0', next: '20.0.0-rc.1' } });
    }) as typeof fetch;

    await expect(fetchLatestVersion('react', { registryUrl: REGISTRY, fetchImpl })).resolves.toEqual({
      name: 'react',
      ok: true,
      latest: '19.2.0',
    });
    expect(accept).toBe('application/vnd.npm.install-v1+json');
  });

  it('reports 404s, other HTTP errors and network failures without throwing', async () => {
    const { fetchImpl } = fakeRegistry({});
    await expect(fetchLatestVersion('private-pkg', { registryUrl: REGISTRY, fetchImpl })).resolves.toEqual({
      name: 'private-pkg',
      ok: false,
      error: 'not found in registry',
    });

    const unauthorized = (async () => new Response('', { status: 401 })) as typeof fetch;
    await expect(fetchLatestVersion('@corp/x', { registryUrl: REGISTRY, fetchImpl: unauthorized })).resolves.toMatchObject({
      ok: false,
      error: 'HTTP 401',
    });

    const offline = (async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }) as typeof fetch;
    await expect(fetchLatestVersion('react', { registryUrl: REGISTRY, fetchImpl: offline })).resolves.toMatchObject({
      ok: false,
      error: 'fetch failed (ENOTFOUND)',
    });
  });

  it('gives up after the timeout', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      })) as typeof fetch;

    await expect(fetchLatestVersion('react', { registryUrl: REGISTRY, fetchImpl: hanging, timeoutMs: 20 })).resolves.toMatchObject({
      ok: false,
      error: 'timed out',
    });
  });
});

describe('fetchLatestVersions', () => {
  it('dedupes names and never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return Response.json({ 'dist-tags': { latest: `1.0.${url.length}` } });
    }) as typeof fetch;
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'b'];

    const results = await fetchLatestVersions(names, { registryUrl: REGISTRY, fetchImpl, concurrency: 2 });

    expect([...results.keys()]).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(peak).toBe(2);
  });
});
