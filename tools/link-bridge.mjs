// Ableton Link → Bonfire Live.
//
// Browsers can't join a Link session (Link talks UDP multicast on the local network), so
// this small bridge does it for them: it reads the session's tempo and beat from
// Carabiner — Deep Symmetry's free Link-to-TCP helper — and passes them on to the
// visualizer over a WebSocket on this computer. With it, djay, rekordbox (with Link on),
// Ableton Live, Traktor and anything else in the session share one beat grid with the
// fire: no guessing from the sound.
//
//   1. Download Carabiner for your system: https://github.com/Deep-Symmetry/carabiner/releases
//      and start it (it listens on port 17000). Turn Link on in your DJ software.
//   2. node tools/link-bridge.mjs        (or: npm run link)
//   3. In Bonfire Live: Settings → Sound → Beat From: Ableton Link.
//
// Options: --carabiner 17000 (Carabiner's port), --port 17001 (the WebSocket port).
// Nothing here talks to the internet: both ports are bound to this computer (127.0.0.1).
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const CARABINER = arg('carabiner', 17000);
const PORT = arg('port', 17001);
const POLL_MS = 40; // how often the session's status is asked for

// --- Carabiner: "status\n" → "status { :peers 1 :bpm 124.000000 :start 7374… :beat 597.73 }"
let latest = null; // { bpm, beat, peers, at (ms, this process's clock) }
let carabiner = null;
function connect() {
  carabiner = net.connect({ host: '127.0.0.1', port: CARABINER });
  let buf = '';
  carabiner.setEncoding('utf8');
  carabiner.on('connect', () => console.log(`Connected to Carabiner on port ${CARABINER}.`));
  carabiner.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const status = parseStatus(line);
      if (status) latest = { ...status, at: performance.now() };
    }
  });
  carabiner.on('error', () => {});
  carabiner.on('close', () => {
    if (latest) console.log('Lost Carabiner; retrying…');
    latest = null;
    carabiner = null;
    setTimeout(connect, 1000);
  });
}
/** Parse a Carabiner status line (null if it isn't one). */
export function parseStatus(line) {
  if (!line.startsWith('status')) return null;
  const num = (key) => {
    const m = new RegExp(`:${key}\\s+(-?[\\d.]+)`).exec(line);
    return m ? Number(m[1]) : null;
  };
  const bpm = num('bpm');
  const beat = num('beat');
  if (!bpm || beat == null) return null;
  return { bpm, beat, peers: num('peers') ?? 0 };
}

// --- WebSocket (just enough of RFC 6455 to send text to a local page) ---------------------
const clients = new Set();
function frame(text) {
  const data = Buffer.from(text);
  const head =
    data.length < 126
      ? Buffer.from([0x81, data.length])
      : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([head, data]);
}
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(
    `Bonfire Live's Link bridge. ${latest ? `Link: ${latest.bpm.toFixed(1)} BPM, ${latest.peers} peer(s).` : 'Waiting for Carabiner…'}\n`,
  );
});
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  clients.add(socket);
  socket.on('data', (d) => {
    if ((d[0] & 0x0f) === 0x8) socket.end();
  }); // a close frame
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
  console.log('Bonfire Live connected.');
});

// Every poll: ask Carabiner, and send the page what's known, with how old it is so the
// page can place the beat on its own clock.
function poll() {
  carabiner?.write('status\n');
  if (!latest || !clients.size) return;
  const age = (performance.now() - latest.at) / 1000;
  const msg = frame(
    JSON.stringify({ bpm: latest.bpm, beat: latest.beat + age * (latest.bpm / 60), peers: latest.peers }),
  );
  for (const c of clients) c.write(msg);
}

// (Run as a script; importing it, e.g. from a test, starts nothing.)
if (process.argv[1]?.endsWith('link-bridge.mjs')) {
  server.listen(PORT, '127.0.0.1', () =>
    console.log(`Link bridge on ws://127.0.0.1:${PORT} (Carabiner on port ${CARABINER}).`),
  );
  connect();
  setInterval(poll, POLL_MS);
}
