// Rebuilds a model with Blender (headless): the bonfire scene by default, or another
// script in tools/ by name. Arguments after the name go to the script.
//
//   npm run model                    tools/bonfire.py -> public/models/bonfire.glb
//   npm run model -- knight          tools/knight.py  -> public/models/knight.glb
//   npm run model:knight             (the same)
//   npm run model -- knight --quick  the knight without its preview renders
//   BLENDER_PATH="C:/path/to/blender.exe" npm run model
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUTS = {
  bonfire: 'public/models/bonfire.glb, assets/source/bonfire.blend, assets/source/bonfire-preview.png',
  knight: 'public/models/knight.glb, assets/source/knight.blend, assets/source/knight-{preview,helmets,poses}.png',
};

const [name = 'bonfire', ...extra] = process.argv.slice(2);
const script = path.join('tools', `${name}.py`);
if (!fs.existsSync(script)) {
  console.error(`No such model script: ${script}`);
  process.exit(1);
}

const candidates = [
  process.env.BLENDER_PATH,
  'D:/SteamLibrary/steamapps/common/Blender/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'blender',
].filter(Boolean);
const blender = candidates.find((p) => p === 'blender' || fs.existsSync(p));

const root = process.cwd();
const run = spawnSync(
  blender,
  ['--background', '--factory-startup', '--python', script, '--', root, ...extra],
  { stdio: 'inherit' },
);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`✓ ${OUTPUTS[name] ?? script}`);
