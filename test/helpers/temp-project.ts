import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Writes `files` (path → contents; objects become JSON) into a fresh temp dir. */
export async function tempProject(files: Record<string, string | object>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'upgrade-scout-'));
  created.push(dir);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
  }
  return dir;
}
