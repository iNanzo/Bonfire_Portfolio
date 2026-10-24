// Find a real ending without assuming that the first reply leads there.
// Blank Next means the following box, just as in the invitation content loader.
export function routeToEnd(intro, start = intro.start) {
  const boxes = new Map(intro.boxes.map((box, i) => [box.id, { box, i }]));
  const queue = [[start]];
  const seen = new Set();
  while (queue.length) {
    const path = queue.shift();
    const id = path.at(-1);
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = boxes.get(id);
    if (!entry) throw new Error(`Dialogue points to missing box: ${id}`);
    const { box, i } = entry;
    const choices = box.choices ?? [];
    if (!choices.length && (box.end || (!box.next && i === intro.boxes.length - 1))) return path;
    const next = choices.length ? choices.map((choice) => choice.next) : [box.next || intro.boxes[i + 1]?.id];
    for (const target of next) queue.push([...path, target]);
  }
  throw new Error(`No dialogue ending is reachable from: ${start}`);
}
