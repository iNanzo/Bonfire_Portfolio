// Projects inventory: at-a-glance panel (hover/focus), expanded item details
// (route #/projects/<id>), screenshot viewer, and "equipped" markers.
import { items, ui } from '../content.js';
import { esc, img, linkAttrs } from '../render.js';
import { blip } from './audio.js';

export function setupInventory(root, { reducedMotion }) {
  const list = items();
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  const glance = root.querySelector('[data-glance]');
  const detail = root.querySelector('[data-detail]');
  const g = (k) => glance.querySelector(`[data-g="${k}"]`);
  const d = (k) => detail.querySelector(`[data-d="${k}"]`);
  const viewerStage = detail.querySelector('.viewer-stage');
  const slots = [...root.querySelectorAll('.slot-item')];
  const r = (k) => root.querySelector(`[data-r="${k}"]`);

  let glanced = null;
  let current = null;
  let imageIndex = 0;

  // --- At a glance ---------------------------------------------------------------
  function showGlance(id) {
    const p = byId[id];
    if (!p || glanced === id) return;
    glanced = id;
    const cover = p.images[0];
    g('img').src = img(cover.src, true);
    g('img').classList.toggle('pixel', !!cover.pixel);
    g('name').textContent = p.name;
    g('meta').textContent = [p.kind, p.year, p.status].filter(Boolean).join(' · ');
    g('summary').textContent = p.summary;
    g('tags').innerHTML = p.tech.map((t) => `<li class="tag">${esc(t)}</li>`).join('');
    g('inspect').href = `#/projects/${p.id}`;
    r('name').textContent = p.name;
    r('meta').textContent = [p.kind, p.year].join(' · ');
    for (const s of slots) s.classList.toggle('is-glanced', s.dataset.item === id);
    glance.classList.remove('is-swapping');
    void glance.offsetWidth;
    glance.classList.add('is-swapping');
  }
  for (const s of slots) {
    s.addEventListener('mouseenter', () => showGlance(s.dataset.item));
    s.addEventListener('focus', () => showGlance(s.dataset.item));
  }
  showGlance(list[0].id);

  // --- Item details ----------------------------------------------------------------
  function showImage(i) {
    const imgs = current.images;
    imageIndex = (i + imgs.length) % imgs.length;
    const im = imgs[imageIndex];
    const el = d('img');
    el.src = img(im.src);
    el.alt = im.alt;
    el.classList.toggle('pixel', !!im.pixel);
    d('caption').textContent = im.caption ?? '';
    d('img-count').textContent = `${imageIndex + 1} / ${imgs.length}`;
    d('thumbs').querySelectorAll('.thumb').forEach((t, n) => t.setAttribute('aria-current', String(n === imageIndex)));
    if (!reducedMotion) {
      viewerStage.classList.remove('is-switching');
      void viewerStage.offsetWidth;
      viewerStage.classList.add('is-switching');
    }
  }

  function open(id) {
    const p = byId[id];
    if (!p) return false;
    current = p;
    const i = list.indexOf(p);
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    d('prev').href = `#/projects/${prev.id}`;
    d('next').href = `#/projects/${next.id}`;
    d('count').textContent = `${i + 1} / ${list.length}`;
    d('meta').textContent = [p.kind, p.year, p.status].filter(Boolean).join(' · ');
    d('title').textContent = p.name;
    d('flavor').textContent = p.flavor ?? '';
    d('flavor').hidden = !p.flavor;
    d('problem').textContent = p.problem;
    d('built').textContent = p.built;
    d('tech').innerHTML = p.tech.map((t) => `<li class="tag">${esc(t)}</li>`).join('');
    d('role').textContent = p.role;
    d('note').textContent = p.note ?? '';
    d('note').hidden = !p.note;
    d('links').innerHTML = (p.links ?? []).map((l) => `<a class="pix-btn" ${linkAttrs(l.href)}>${esc(l.label)} &gt;</a>`).join('');
    const multi = p.images.length > 1;
    d('controls').hidden = !multi;
    d('thumbs').hidden = !multi;
    d('thumbs').innerHTML = multi
      ? p.images.map((im, n) => `<button class="thumb" type="button" data-thumb="${n}" aria-label="Show image ${n + 1}: ${esc(im.caption ?? '')}"><img src="${img(im.src, true)}" alt="" loading="lazy"></button>`).join('')
      : '';
    showImage(0);
    for (const s of slots) s.toggleAttribute('aria-current', s.dataset.item === id);
    detail.classList.remove('is-opening');
    void detail.offsetWidth;
    detail.classList.add('is-opening');
    showGlance(id);
    return true;
  }

  detail.addEventListener('click', (e) => {
    if (e.target.closest('[data-prev-img]')) { showImage(imageIndex - 1); blip('move'); }
    else if (e.target.closest('[data-next-img]')) { showImage(imageIndex + 1); blip('move'); }
    else {
      const t = e.target.closest('[data-thumb]');
      if (t) { showImage(Number(t.dataset.thumb)); blip('move'); }
    }
  });
  detail.addEventListener('keydown', (e) => {
    if (!current || current.images.length < 2 || e.target.closest('a, [data-d="thumbs"]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showImage(imageIndex - 1); blip('move'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showImage(imageIndex + 1); blip('move'); }
  });

  /** Mark the slot whose weapon is in the fire. */
  function markEquipped(id, label) {
    for (const s of slots) s.querySelector('[data-equipped-badge]').hidden = s.dataset.item !== id;
    const line = root.querySelector('[data-equipped-line]');
    line.textContent = id ? `${ui.equipped}: ${byId[id].name}` : '';
    d('wield-text').textContent = label;
  }

  // Leaving the grid returns the readout to the selected (or first) item.
  root.querySelector('[data-inv-grid]').addEventListener('mouseleave', () => {
    if (!root.querySelector('[data-inv-grid]').contains(document.activeElement)) showGlance(current?.id ?? list[0].id);
  });

  return {
    open,
    showGlance,
    markEquipped,
    has: (id) => !!byId[id],
    slotFor: (id) => slots.find((s) => s.dataset.item === id),
    get current() { return current; },
  };
}
