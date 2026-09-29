// Projects inventory: at-a-glance panel (hover/focus), expanded item details
// (route #/projects/<id>), screenshot viewer and full-size gallery, and "equipped"
// markers. The grid shows just enough empty slots to finish its last row.
import { items, ui } from '../content.js';
import { esc, img, clip, linkAttrs } from '../render.js';
import { blip } from './audio.js';

export function setupInventory(root, { reducedMotion }) {
  const list = items();
  const byId = new Map(list.map((p) => [p.id, p]));
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

  // --- Selection cursor: glides to the glanced slot and locks on -------------------
  const box = root.querySelector('.inv-box');
  const cursor = root.querySelector('[data-inv-cursor]');
  function placeCursor({ glide }) {
    const frame = slots.find((s) => s.dataset.item === glanced)?.querySelector('.slot-frame');
    if (!frame || !box.offsetWidth) return;
    const b = box.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    cursor.classList.toggle('is-snapping', !glide || cursor.hidden);
    cursor.hidden = false;
    cursor.style.setProperty('--x', `${f.left - b.left}px`);
    cursor.style.setProperty('--y', `${f.top - b.top}px`);
    cursor.style.setProperty('--s', `${f.width}px`);
    if (glide && !reducedMotion) {
      cursor.classList.remove('is-locking');
      void cursor.offsetWidth;
      cursor.classList.add('is-locking');
    }
  }
  // Empty slots: only enough to finish the last row (how many fit a row depends on the width).
  const grid = root.querySelector('[data-inv-grid]');
  const empties = [...grid.querySelectorAll('.is-empty')];
  function fitEmpties() {
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    const need = (cols - (slots.length % cols)) % cols;
    empties.forEach((e, i) => { e.hidden = i >= need; });
  }
  new ResizeObserver(() => { fitEmpties(); placeCursor({ glide: false }); }).observe(box);
  fitEmpties();

  // --- At a glance ---------------------------------------------------------------
  function showGlance(id) {
    const p = byId.get(id);
    if (!p || glanced === id) return;
    glanced = id;
    placeCursor({ glide: true });
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
  if (list.length) showGlance(list[0].id);

  // --- Item details ----------------------------------------------------------------
  /**
   * Put image entry `im` in an <img>/<video> pair: a still, or a clip (`video: true`: its
   * .mp4, with the still as the poster) that plays muted on a loop (paused under reduced
   * motion, with the still until it's played).
   */
  function showMedia(im, still, video) {
    still.alt = im.alt;
    still.classList.toggle('pixel', !!im.pixel);
    video.classList.toggle('pixel', !!im.pixel);
    video.hidden = !im.video;
    still.hidden = !!im.video;
    if (im.video) {
      video.poster = img(im.src);
      video.setAttribute('aria-label', im.alt);
      if (video.dataset.src !== im.src) { video.dataset.src = im.src; video.src = clip(im.src); }
      if (!reducedMotion) video.play().catch(() => {});
    } else {
      video.pause();
      still.src = img(im.src);
    }
  }
  function showImage(i) {
    const imgs = current.images;
    imageIndex = (i + imgs.length) % imgs.length;
    const im = imgs[imageIndex];
    showMedia(im, d('img'), d('video'));
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
    const p = byId.get(id);
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
    d('outcome').textContent = p.outcome ?? '';
    d('outcome').hidden = !p.outcome;
    d('flavor').textContent = p.flavor ?? '';
    d('flavor').hidden = !p.flavor;
    d('problem').textContent = p.problem;
    d('built').textContent = p.built;
    d('tech').innerHTML = p.tech.map((t) => `<li class="tag">${esc(t)}</li>`).join('');
    d('role').textContent = p.role;
    d('note').textContent = p.note ?? '';
    d('note').hidden = !p.note;
    d('links').innerHTML = (p.links ?? []).map((l) => `<a class="pix-btn detail-link" ${linkAttrs(l.href)}>${esc(l.label)} &gt;</a>`).join('');
    d('links').hidden = !p.links?.length;
    const multi = p.images.length > 1;
    d('controls').hidden = !multi;
    d('thumbs').hidden = !multi;
    d('thumbs').innerHTML = multi
      ? p.images.map((im, n) => `<button class="thumb" type="button" data-thumb="${n}" aria-label="Show image ${n + 1}: ${esc(im.caption ?? '')}"><img src="${esc(img(im.src, true))}" alt="" loading="lazy"></button>`).join('')
      : '';
    showImage(0);
    for (const s of slots) {
      if (s.dataset.item === id) s.setAttribute('aria-current', 'page');
      else s.removeAttribute('aria-current');
    }
    detail.classList.remove('is-opening');
    void detail.offsetWidth;
    detail.classList.add('is-opening');
    showGlance(id);
    return true;
  }

  // --- Gallery: the screenshots full size, one at a time -------------------------------
  const gallery = root.querySelector('[data-gallery]');
  const gl = (k) => gallery.querySelector(`[data-gl="${k}"]`);
  function showGallery(i) {
    showImage(i);
    const im = current.images[imageIndex];
    showMedia(im, gl('img'), gl('video'));
    gl('caption').textContent = im.caption ?? '';
    gl('count').textContent = `${imageIndex + 1} / ${current.images.length}`;
    gallery.querySelectorAll('[data-gl-prev], [data-gl-next]').forEach((b) => { b.hidden = current.images.length < 2; });
  }
  gallery.addEventListener('click', (e) => {
    if (e.target === gallery || e.target.closest('[data-gl-close]')) gallery.close();
    else if (e.target.closest('[data-gl-prev]')) { showGallery(imageIndex - 1); blip('move'); }
    else if (e.target.closest('[data-gl-next]')) { showGallery(imageIndex + 1); blip('move'); }
  });
  gallery.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showGallery(imageIndex - 1); blip('move'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showGallery(imageIndex + 1); blip('move'); }
  });
  gallery.addEventListener('close', () => { gl('video').pause(); blip('back'); });

  detail.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-gallery]')) {
      showGallery(imageIndex);
      gallery.showModal();
      gallery.querySelector('[data-gl-close]').focus();
      blip('select');
    } else if (e.target.closest('[data-prev-img]')) { showImage(imageIndex - 1); blip('move'); }
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

  /** Mark the slot whose item holds the fire (moves on click, before the weapon lands). */
  function markEquipped(id) {
    for (const s of slots) s.querySelector('[data-equipped-badge]').hidden = s.dataset.item !== id;
    const line = root.querySelector('[data-equipped-line]');
    line.textContent = id ? `${ui.equipped}: ${byId.get(id).name}` : '';
  }
  /** What the inspected item wields (changes when its weapon lands). */
  function setWield(label) {
    d('wield-text').textContent = label;
  }

  // Leaving the grid returns the readout to the selected (or first) item.
  root.querySelector('[data-inv-grid]').addEventListener('mouseleave', () => {
    if (!root.querySelector('[data-inv-grid]').contains(document.activeElement)) showGlance(current?.id ?? list[0]?.id);
  });

  return {
    open,
    showGlance,
    markEquipped,
    setWield,
    has: (id) => byId.has(id),
    slotFor: (id) => slots.find((s) => s.dataset.item === id),
    get current() { return current; },
  };
}
