// HTML templates. All text comes from content.js.
import {
  site, screens, hero, sections, items, archive, about,
  experience, leadership, education, skills, contact, ui, shown,
} from './content.js';

const BASE = import.meta.env?.BASE_URL ?? '/'; // (outside Vite, e.g. under node --test: the root)

export { esc } from './html.js';
import { esc, isSafeUrl, assetUrl } from './html.js';
import { logoMark } from './ui/logo.js';
export const isExternal = (href) => /^(https?:|mailto:)/i.test(href);
export const url = (href) => {
  if (!isSafeUrl(href)) throw new Error('Invalid link: ' + href);
  return isExternal(href) ? href : BASE + href;
};
export const linkAttrs = (href) =>
  `href="${esc(url(href))}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`;
export const img = (src, card = false) => assetUrl(src, BASE, card);

export const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';
const screenMeta = Object.fromEntries(screens.map((s) => [s.id, s]));

function screenHead(id) {
  const s = sections[id] ?? {};
  return `
    <header class="screen-head">
      <h1 class="screen-title" id="${id}-title" tabindex="-1">${esc(s.title ?? screenMeta[id].label)}</h1>
      ${s.flavor ? `<p class="screen-flavor">${esc(s.flavor)}</p>` : ''}
      ${s.intro ? `<p class="screen-intro">${esc(s.intro)}</p>` : ''}
    </header>`;
}

function panel(cls, inner, attrs = '') {
  return `<div class="panel frame ${cls}" ${attrs}>${corners}${inner}</div>`;
}

// --- Chrome -------------------------------------------------------------------------

export function renderChrome() {
  const tabs = screens.filter((s) => s.id !== 'home');
  return `
    <a class="skip-link" href="#main">${esc(ui.skip)}</a>
    <div class="stage" data-stage></div>
    <header class="site-header" data-header>
      <a class="brand" href="#/" aria-label="${esc(site.name)}, home">
        ${logoMark('brand-mark')}<span class="brand-name">${esc(site.name)}</span>
      </a>
      <nav class="tabs" aria-label="Main">
        <kbd class="tab-key" aria-hidden="true">Q</kbd>
        <ul role="list">${tabs.map((s) => `<li><a href="#/${s.id}" data-tab="${s.id}">${esc(s.label)}</a></li>`).join('')}</ul>
        <kbd class="tab-key" aria-hidden="true">E</kbd>
      </nav>
      <div class="header-actions">
        <button class="pix-btn sound-toggle" type="button" data-sound aria-pressed="false">
          <span class="sound-icon" aria-hidden="true"></span><span data-sound-label>${esc(ui.soundOff)}</span>
        </button>
        <button class="pix-btn menu-toggle" type="button" data-menu-open aria-haspopup="dialog">${esc(ui.menu)}</button>
      </div>
    </header>
    <dialog class="rest-menu" data-menu aria-label="${esc(ui.menu)}">
      <div class="rest-menu-inner frame">
        ${corners}
        <p class="rest-menu-title">${esc(ui.menu)}</p>
        <p class="rest-menu-flavor">${esc(ui.menuFlavor)}</p>
        <ul role="list" data-menu-list>
          ${screens.map((s) => `<li><a class="menu-item" href="#/${s.id === 'home' ? '' : s.id}" data-menu-item>${esc(s.label)}</a></li>`).join('')}
          <li class="menu-sep" aria-hidden="true"></li>
          <li><button class="menu-item" type="button" data-menu-item data-sound><span data-sound-label>${esc(ui.soundOff)}</span></button></li>
          <li><button class="menu-item" type="button" data-menu-item data-menu-close>${esc(ui.close)}</button></li>
        </ul>
        <p class="rest-menu-keys">${esc(ui.keysHint)}</p>
      </div>
    </dialog>
    <div class="prompts" aria-hidden="true">
      ${ui.prompts.map(([a, b, label]) => `<span class="prompt" data-prompt="${esc(label)}"><kbd>${esc(a)}</kbd>${b ? `<kbd>${esc(b)}</kbd>` : ''}${esc(label)}</span>`).join('')}
      <span class="prompt prompt-stoke">${esc(ui.stokePrompt)}</span>
    </div>
    <div class="kindled" data-kindled hidden style="--kindle-time: ${Number(hero.kindled.duration) || 2600}ms">
      <div class="kindled-band">
        <p class="kindled-title">${esc(hero.kindled.title)}</p>
        <p class="kindled-sub">${esc(hero.kindled.subtitle)}</p>
      </div>
    </div>
    <p class="visually-hidden" aria-live="polite" data-live></p>
    <div class="debug-hud" data-debug hidden></div>
    <div class="tooltip" data-tooltip hidden aria-hidden="true"><p class="tooltip-name"></p><p class="tooltip-flavor"></p></div>`;
}

// --- Home (title screen) ---------------------------------------------------------------

export function renderHome() {
  const menu = screens.filter((s) => s.id !== 'home');
  return `
    <section class="screen screen-home" data-screen="home" aria-labelledby="home-title" aria-describedby="scene-label">
      <p class="visually-hidden" id="scene-label">${esc(hero.sceneLabel)}</p>
      <div class="home-copy">
        <p class="eyebrow">${esc(hero.eyebrow)}</p>
        <h1 class="hero-name" id="home-title" tabindex="-1">${esc(site.name)}</h1>
        <p class="hero-value">${esc(hero.value)}</p>
        <nav class="title-menu" aria-label="${esc(hero.menuLabel)}">
          <ul role="list" data-title-menu>
            ${menu.map((s) => `
              <li><a class="title-item" href="#/${s.id}" data-title-item>
                <span class="cursor" aria-hidden="true"></span>
                <span class="title-label">${esc(s.label)}</span>
              </a></li>`).join('')}
          </ul>
        </nav>
        <button class="pix-btn stoke-btn" type="button" data-stoke>
          <span class="stoke-icon" aria-hidden="true"></span>${esc(hero.stokeLabel)}
          <span class="stoke-hint" data-stoke-hint aria-hidden="true">${esc(hero.stokeHint.pointer)}</span>
        </button>
      </div>
    </section>`;
}

// --- Projects (inventory) -------------------------------------------------------------
// Left: the selected item (at-a-glance, or full details when inspecting).
// Right: the inventory grid — square slots, empty ones included.

const GRID_SLOTS = 16;

function slot(p, i) {
  const cover = p.images[0];
  return `
    <li class="slot-cell" data-nav-item>
      <a class="slot-item" href="#/projects/${esc(p.id)}" data-item="${esc(p.id)}" data-index="${i}"
         aria-label="${esc(`${p.name}, ${p.kind}, ${p.year}`)}">
        <span class="slot-frame">
          <img src="${esc(img(cover.src, true))}" alt="" width="720" height="450" loading="lazy" decoding="async"${cover.pixel ? ' class="pixel"' : ''}>
          <span class="veil" aria-hidden="true"></span>
          <span class="slot-badge" data-equipped-badge hidden aria-hidden="true">E</span>
        </span>
        <span class="slot-caption" aria-hidden="true">${esc(p.name)}</span>
      </a>
    </li>`;
}

export function renderProjects() {
  const list = items();
  const empty = Math.max(0, GRID_SLOTS - list.length);
  const tabletop = shown(archive).find((a) => a.href);
  return `
    <section class="screen screen-projects" data-screen="projects" data-mode="browse" aria-labelledby="projects-title" hidden>
      <div class="inv-layout">
        ${panel('glance', `
          <div class="glance-media"><img data-g="img" alt="" width="720" height="450"><span class="veil" aria-hidden="true"></span></div>
          <p class="glance-meta" data-g="meta"></p>
          <h2 class="glance-title" data-g="name"></h2>
          <p class="glance-summary" data-g="summary"></p>
          <ul class="tags" role="list" data-g="tags"></ul>
          <a class="pix-btn glance-inspect" data-g="inspect" href="#/projects" tabindex="-1">${esc(ui.inspect)} <kbd>Enter</kbd></a>
        `, 'data-glance aria-hidden="true"')}
        ${panel('detail', `
          <div class="detail-top">
            <a class="pix-btn" href="#/projects" data-back>&lt; ${esc(ui.back)} <kbd>Esc</kbd></a>
            <div class="detail-nav">
              <a class="pix-btn" data-d="prev" href="#/projects" aria-label="${esc(ui.prevItem)}">&lt;</a>
              <span data-d="count"></span>
              <a class="pix-btn" data-d="next" href="#/projects" aria-label="${esc(ui.nextItem)}">&gt;</a>
            </div>
          </div>
          <figure class="viewer">
            <div class="viewer-stage"><img data-d="img" alt=""><span class="veil" aria-hidden="true"></span></div>
            <div class="viewer-bar">
              <figcaption class="viewer-caption" data-d="caption"></figcaption>
              <div class="viewer-controls" data-d="controls">
                <button class="pix-btn" type="button" data-prev-img aria-label="${esc(ui.prevImage)}">&lt;</button>
                <span data-d="img-count" aria-live="polite"></span>
                <button class="pix-btn" type="button" data-next-img aria-label="${esc(ui.nextImage)}">&gt;</button>
              </div>
            </div>
            <div class="thumbs" data-d="thumbs"></div>
          </figure>
          <p class="detail-meta" data-d="meta"></p>
          <h2 class="detail-title" id="detail-title" tabindex="-1" data-d="title"></h2>
          <p class="detail-wield" data-d="wield"><span class="gem" aria-hidden="true"></span><span data-d="wield-text"></span></p>
          <p class="detail-flavor" data-d="flavor"></p>
          <dl class="detail-facts">
            <div><dt>${esc(ui.problem)}</dt><dd data-d="problem"></dd></div>
            <div><dt>${esc(ui.built)}</dt><dd data-d="built"></dd></div>
            <div><dt>${esc(ui.tech)}</dt><dd><ul class="tags" role="list" data-d="tech"></ul></dd></div>
            <div><dt>${esc(ui.role)}</dt><dd data-d="role"></dd></div>
          </dl>
          <p class="detail-note" data-d="note"></p>
          <div class="detail-links" data-d="links"></div>
        `, 'data-detail role="region" aria-labelledby="detail-title"')}
        ${panel('inv-panel', `
          ${screenHead('projects')}
          <div class="inv-box">
            <span class="inv-cursor" data-inv-cursor aria-hidden="true" hidden></span>
            <ul class="inv-grid" role="list" data-inv-grid>
              ${list.map(slot).join('')}
              ${'<li class="slot-cell is-empty" aria-hidden="true"><span class="slot-frame"></span></li>'.repeat(empty)}
            </ul>
          </div>
          <div class="inv-readout" aria-hidden="true">
            <p class="readout-name" data-r="name"></p>
            <p class="readout-meta" data-r="meta"></p>
          </div>
          <p class="inv-count"><span>${list.length} / ${GRID_SLOTS}</span><span data-equipped-line></span></p>
          ${tabletop ? `<p class="inv-also">Also: <a ${linkAttrs(tabletop.href)}>${esc(tabletop.name)}</a> — ${esc(tabletop.summary)}</p>` : ''}
        `)}
      </div>
    </section>`;
}

// --- Experience ----------------------------------------------------------------------

export function renderExperience() {
  return `
    <section class="screen screen-experience side-right" data-screen="experience" aria-labelledby="experience-title" hidden>
      ${panel('page-panel', `
        ${screenHead('experience')}
        ${shown(experience).filter((org) => shown(org.roles).length).map((org) => `
          <div class="org">
            <div class="org-head"><h2>${esc(org.org)}</h2><span>${esc(org.location)}</span></div>
            <ol class="roles" role="list">
              ${shown(org.roles).map((r) => `
                <li class="role">
                  <p class="role-dates">${esc(r.dates)}</p>
                  <h3 class="role-title">${esc(r.title)}</h3>
                  <ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
                </li>`).join('')}
            </ol>
          </div>`).join('')}
        <div class="leadership">
          <div class="subhead"><h2>${esc(leadership.title)}</h2><p>${esc(leadership.flavor)}</p></div>
          <div class="lead-grid">
            ${shown(leadership.items).map((l) => `
              <article class="lead-item">
                <h3>${esc(l.org)}</h3>
                <p class="lead-role">${esc(l.role)}</p>
                <p class="lead-dates">${esc(l.dates)}</p>
                <p>${esc(l.text)}</p>
              </article>`).join('')}
          </div>
        </div>
        <div class="education">
          <div class="subhead"><h2>Education & certificates</h2></div>
          <ul class="edu-list" role="list">
            ${shown(education).map((e) => `<li class="edu-row"><strong>${esc(e.name)}</strong><span class="edu-dates">${esc(e.dates)}</span><span>${esc(e.org)}</span></li>`).join('')}
          </ul>
        </div>
      `)}
    </section>`;
}

// --- Skills ---------------------------------------------------------------------------

export function renderSkills() {
  return `
    <section class="screen screen-skills side-left" data-screen="skills" aria-labelledby="skills-title" hidden>
      ${panel('page-panel', `
        ${screenHead('skills')}
        <div class="skill-groups" data-skill-grid>
          ${shown(skills).filter((g) => shown(g.items).length).map((g) => `
            <div class="skill-group">
              <h2>${esc(g.group)}</h2>
              <ul class="slots" role="list">
                ${shown(g.items).map((s) => `
                  <li data-nav-item>
                    <button class="slot" type="button" data-skill="${esc(s.name)}" data-flavor="${esc(s.flavor)}">
                      <span class="slot-glyph" aria-hidden="true">${esc(s.glyph)}</span>
                      <span class="slot-label">${esc(s.name)}</span>
                      <span class="visually-hidden">: ${esc(s.flavor)}</span>
                    </button>
                  </li>`).join('')}
              </ul>
            </div>`).join('')}
        </div>
      `)}
    </section>`;
}

// --- About ----------------------------------------------------------------------------

export function renderAbout() {
  return `
    <section class="screen screen-about side-right" data-screen="about" aria-labelledby="about-title" hidden>
      ${panel('page-panel', `
        ${screenHead('about')}
        <div class="about-copy">${about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <aside class="stat-sheet" aria-label="At a glance">
          <p class="stat-sheet-title">Status</p>
          <dl>
            ${about.stats.map(([k, v]) => `<div class="stat-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
            <div class="stat-row"><dt>${esc(ui.wields)}</dt><dd data-equip-label></dd></div>
          </dl>
        </aside>
      `)}
    </section>`;
}

// --- Contact --------------------------------------------------------------------------

export function renderContact() {
  return `
    <section class="screen screen-contact side-left" data-screen="contact" aria-labelledby="contact-title" hidden>
      ${panel('page-panel', `
        ${screenHead('contact')}
        <p class="contact-heading">${esc(contact.heading)}</p>
        <p class="contact-body">${esc(contact.body)}</p>
        <ul class="contact-links" role="list">
          ${shown(contact.links).map((l) => `
            <li><a class="contact-link" ${linkAttrs(l.href)}>
              <span class="contact-label">${esc(l.label)}</span>
              <span class="contact-value">${esc(l.value)}</span>
              <span class="contact-arrow" aria-hidden="true">&gt;</span>
            </a></li>`).join('')}
        </ul>
        <footer class="site-footer">
          <p>${esc(contact.footer)}</p>
          <a href="#/" class="text-link">${esc(contact.backToTop)}</a>
        </footer>
      `)}
    </section>`;
}
