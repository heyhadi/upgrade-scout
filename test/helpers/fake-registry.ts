/** A `fetch` that answers npm abbreviated-metadata requests from a name → latest map. */
export function fakeRegistry(latestByName: Record<string, string>) {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    const name = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1).replace('%2f', '/'));
    requested.push(name);
    const latest = latestByName[name];
    if (!latest) return new Response('{"error":"Not found"}', { status: 404 });
    return Response.json({ name, 'dist-tags': { latest } });
  }) as typeof fetch;
  return { fetchImpl, requested };
}
