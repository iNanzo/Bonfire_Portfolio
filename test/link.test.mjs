// The Ableton Link bridge (tools/link-bridge.mjs): Carabiner's status lines in, the
// session's tempo and beat out to the page over a WebSocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { parseStatus } from '../tools/link-bridge.mjs';

test('link bridge: parses Carabiner status lines', () => {
  assert.deepEqual(parseStatus('status { :peers 2 :bpm 126.000000 :start 7374 :beat 12.5 }'), { bpm: 126, beat: 12.5, peers: 2 });
  assert.equal(parseStatus('bad-command'), null);
  assert.equal(parseStatus('status { :peers 0 }'), null);
});

test('link bridge: a fake Carabiner session reaches a WebSocket client', { timeout: 15000 }, async (t) => {
  // A stand-in Carabiner: answers every "status" with 128 BPM, beat 16.
  const fake = net.createServer((sock) => {
    sock.setEncoding('utf8');
    sock.on('error', () => {}); // (the bridge is killed at the end)
    sock.on('data', (d) => { if (d.includes('status')) sock.write('status { :peers 1 :bpm 128.000000 :start 1 :beat 16.000000 }\n'); });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const carabiner = fake.address().port;
  const port = 17900 + Math.floor(Math.random() * 90);
  const bridge = spawn(process.execPath, ['tools/link-bridge.mjs', '--carabiner', String(carabiner), '--port', String(port)], { stdio: 'pipe' });
  t.after(() => { bridge.kill(); fake.close(); });
  await new Promise((r) => bridge.stdout.on('data', (d) => { if (String(d).includes('Link bridge on')) r(); }));
  const msg = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.onmessage = (e) => { resolve(JSON.parse(e.data)); ws.close(); };
    ws.onerror = reject;
  });
  assert.equal(msg.bpm, 128);
  assert.equal(msg.peers, 1);
  assert.ok(msg.beat >= 16 && msg.beat < 17, `the beat moves on with time (${msg.beat})`);
});
