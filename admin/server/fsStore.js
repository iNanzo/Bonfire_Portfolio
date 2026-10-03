// @ts-nocheck: 2 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The local store (Node only): the same interface as the GitHub store, reading and
// writing files in a folder (this repo by default). Powers `npm run admin`, which
// edits your working copy directly — nothing is committed or deployed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors.js';
import { gitBlobSha } from './bytes.js';
import { CONTENT_PATH } from '../../src/contentRules.js';

export function createFsStore(root) {
  const top = path.resolve(root);
  const abs = (p) => {
    const full = path.resolve(top, p);
    if (!full.startsWith(top + path.sep)) throw new HttpError(400, 'Path outside the site.');
    return full;
  };
  const readBytes = async (p) => {
    try {
      return new Uint8Array(await fs.readFile(abs(p)));
    } catch (e) {
      if (e.code === 'ENOENT') throw new HttpError(404, `${p} not found.`);
      throw e;
    }
  };
  return {
    mode: 'local',
    label: top,
    async read(p) {
      const bytes = await readBytes(p);
      return { text: new TextDecoder().decode(bytes), sha: await gitBlobSha(bytes) };
    },
    readBytes,
    async commit({ baseSha, files, deletes = [] }) {
      if ((await this.read(CONTENT_PATH)).sha !== baseSha) {
        throw new HttpError(409, 'content.json changed on disk since you opened it. Reload to get the latest.');
      }
      for (const f of files) {
        await fs.mkdir(path.dirname(abs(f.path)), { recursive: true });
        await fs.writeFile(abs(f.path), f.bytes);
      }
      for (const p of deletes) await fs.rm(abs(p), { force: true });
      const content = files.find((f) => f.path === CONTENT_PATH);
      return { commit: { sha: null, url: null }, contentSha: content ? await gitBlobSha(content.bytes) : baseSha };
    },
    async deployStatus() {
      return { state: 'local' };
    },
  };
}
