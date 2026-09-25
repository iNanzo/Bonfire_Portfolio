// Rebuilds the bonfire model with Blender (headless).
//
//   npm run model
//   BLENDER_PATH="C:/path/to/blender.exe" npm run model
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  ['--background', '--factory-startup', '--python', path.join('tools', 'bonfire.py'), '--', root],
  { stdio: 'inherit' },
);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log('✓ public/models/bonfire.glb, assets/source/bonfire.blend, assets/source/bonfire-preview.png');
