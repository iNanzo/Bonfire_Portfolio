// HTML templates. All text comes from content.js.
import {
  site, screens, hero, sections, items, archive, about,
  experience, leadership, education, skills, contact, ui, shown,
} from './content.js';

const BASE = import.meta.env?.BASE_URL ?? '/'; // (outside Vite, e.g. under node --test: the root)

export { esc } from './html.js';
import { esc, isSafeUrl, assetUrl, videoUrl, corners } from './html.js';
import { logoMark } from './ui/logo.js';
import { describedTip } from './ui/describedTip.js';
export const isExternal = (href) => /^(https?:|mailto:)/i.test(href);
export const url = (href) => {
  if (!isSafeUrl(href)) throw new Error('Invalid link: ' + href);
  return isExternal(href) ? href : BASE + href;
};
export const linkAttrs = (href) =>
  `href="${esc(url(href))}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`;
export const img = (src, card = false) => assetUrl(src, BASE, card);
export const clip = (src) => videoUrl(src, BASE);
/** The résumé link's attributes (it opens in a new tab), or '' when there's none. */
const resumeAttrs = () => (site.resumeUrl ? `href="${esc(url(site.resumeUrl))}" target="_blank" rel="noopener"` : '');

export { corners };
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
  // (Q's and E's tips are their names and keys, which they say already: aria-label and
  // aria-keyshortcuts. Sound's says what a click does: a screen reader hears it too.)
  const soundTip = describedTip('sound-tip', ui.soundHint);
  return `
    <a class="skip-link" href="#main">${esc(ui.skip)}</a>
    <div class="stage" data-stage></div>
    <header class="site-header" data-header>
      <a class="brand" href="#/" aria-label="${esc(site.name)}, home">
        ${logoMark('brand-mark')}<span class="brand-name">${esc(site.name)}</span>
      </a>
      <nav class="tabs" aria-label="Main">
        <button class="tab-key" type="button" data-step="-1" data-tip="${esc(ui.prevScreen)} (Q)" data-tip-side="bottom" aria-label="${esc(ui.prevScreen)}" aria-keyshortcuts="Q">Q</button>
        <ul role="list">${tabs.map((s) => `<li><a href="#/${s.id}" data-tab="${s.id}">${esc(s.label)}</a></li>`).join('')}<li class="tabs-cursor" aria-hidden="true" data-tabs-cursor hidden></li></ul>
        <button class="tab-key" type="button" data-step="1" data-tip="${esc(ui.nextScreen)} (E)" data-tip-side="bottom" aria-label="${esc(ui.nextScreen)}" aria-keyshortcuts="E">E</button>
      </nav>
      <div class="header-actions">
        ${site.resumeUrl ? `<a class="pix-btn resume-btn" ${resumeAttrs()} data-resume hidden>${esc(ui.resume)}</a>` : ''}
        <button class="pix-btn sound-toggle" type="button" data-sound aria-pressed="false"${soundTip.attrs} data-tip-side="bottom">
          <span class="sound-icon" aria-hidden="true"></span><span data-sound-label>${esc(ui.soundOff)}</span>
        </button>${soundTip.note}
        <button class="pix-btn menu-toggle" type="button" data-menu-open aria-haspopup="dialog">${esc(ui.menu)}</button>
      </div>
    </header>
    ${renderRestMenu()}
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
    <dialog class="rest-menu" data-discoveries aria-labelledby="discoveries-title">
      <div class="rest-menu-inner frame discoveries-inner">
        ${corners}
        <p class="rest-menu-title" id="discoveries-title">${esc(ui.discoveries)} <span data-discovery-count></span></p>
        <p class="rest-menu-flavor">${esc(ui.discoveriesFlavor)}</p>
        <ul class="discovery-list" role="list" data-discovery-list></ul>
        <button class="pix-btn" type="button" data-discoveries-close>${esc(ui.close)} <kbd>Esc</kbd></button>
      </div>
    </dialog>
    <div class="toast" data-toast hidden role="status"><span class="toast-kicker" data-toast-kicker></span><span class="toast-text" data-toast-text></span></div>
    <p class="visually-hidden" aria-live="polite" data-live></p>`;
}

/** The rest menu's group headings and the tools' own words (the content has no keys for these). */
export const MENU_TEXT = {
  goTo: 'Go To',
  tools: 'Tools',
  keys: 'Keyboard Shortcuts',
  keysHint: 'Every key the site answers, in one list.',
  renderHint: 'The picture’s pixel size, palette, dither and outlines, and the cursor’s way with the fire.',
};

/**
 * The rest menu (the header's Menu button, at every width): Go To (the screens and the
 * résumé: the header's tabs do this from 900 px up, so it hides there) and Tools (photo
 * mode, the breakdown, the render settings, the discoveries, the keys, sound), each a
 * labelled group, then Close. Every item is a `data-menu-item` for its arrow keys
 * (ui/spatial.js listNav skips the hidden ones); the tools say what they do as their
 * tooltips (a screen reader hears them as descriptions: ui/describedTip.js), and show their
 * keys.
 */
function renderRestMenu() {
  const tool = (action, label, key, hint = '') => {
    const tip = describedTip(`menu-tip-${action}`, hint);
    return `
            <li><button class="menu-item" type="button" data-menu-item data-menu-action="${action}"${key ? ` aria-keyshortcuts="${key === '?' ? 'Shift+?' : key}"` : ''}${tip.attrs}>${esc(label)}${key ? ` <kbd>${esc(key)}</kbd>` : ''}</button>${tip.note}</li>`;
  };
  const discoveriesTip = describedTip('menu-tip-discoveries', ui.discoveriesFlavor);
  const soundTip = describedTip('menu-tip-sound', ui.soundHint);
  return `
    <dialog class="rest-menu" data-menu aria-labelledby="rest-menu-title">
      <div class="rest-menu-inner frame">
        ${corners}
        <p class="rest-menu-title" id="rest-menu-title">${esc(ui.menu)}</p>
        <p class="rest-menu-flavor">${esc(ui.menuFlavor)}</p>
        <div class="menu-group menu-go-to" role="group" aria-labelledby="menu-go-to-title">
          <p class="menu-group-title" id="menu-go-to-title">${esc(MENU_TEXT.goTo)}</p>
          <ul role="list" data-menu-list>
            ${screens.map((s) => `<li><a class="menu-item" href="#/${s.id === 'home' ? '' : s.id}" data-menu-item>${esc(s.label)}</a></li>`).join('')}
            ${site.resumeUrl ? `<li data-resume hidden><a class="menu-item" ${resumeAttrs()} data-menu-item>${esc(ui.resume)}</a></li>` : ''}
          </ul>
        </div>
        <div class="menu-group" role="group" aria-labelledby="menu-tools-title">
          <p class="menu-group-title" id="menu-tools-title">${esc(MENU_TEXT.tools)}</p>
          <ul role="list">${tool('photo', ui.photo, 'F', ui.photoHint)}${tool('breakdown', ui.breakdown, 'B', ui.breakdownHint)}${tool('render', ui.renderMenu ?? 'Render Settings', 'P', MENU_TEXT.renderHint)}
            <li><button class="menu-item" type="button" data-menu-item data-menu-action="discoveries"${discoveriesTip.attrs}>${esc(ui.discoveries)} <span class="menu-count" data-discovery-count></span></button>${discoveriesTip.note}</li>${tool('keys', MENU_TEXT.keys, '?', MENU_TEXT.keysHint)}
            <li><button class="menu-item" type="button" data-menu-item data-sound aria-pressed="false"${soundTip.attrs}><span data-sound-label>${esc(ui.soundOff)}</span></button>${soundTip.note}</li>
          </ul>
        </div>
        <button class="menu-item menu-close" type="button" data-menu-item data-menu-close>${esc(ui.close)} <kbd>Esc</kbd></button>
        <p class="rest-menu-keys">${esc(ui.keysHint)}</p>
      </div>
    </dialog>`;
}

// --- Home (title screen) ---------------------------------------------------------------

/**
 * The scene's description for screen readers (#scene-label): the scenery and the fire, then
 * the knight's sentence while he's by the fire (true), or his summon sign's while he's away
 * and can be called ('sign'), or nothing of him (false: his model didn't load, the site's
 * setting has him off, or the scene isn't there yet). main.js redraws it as he comes and goes.
 * @param {boolean | 'sign'} [knight]
 */
export function sceneLabel(knight = false) {
  const his = knight === 'sign' ? hero.sceneSign : knight ? hero.sceneKnight : '';
  return [hero.sceneLabel, his].filter((s) => s?.trim()).join(' ');
}

export function renderHome() {
  const menu = screens.filter((s) => s.id !== 'home');
  return `
    <section class="screen screen-home" data-screen="home" aria-labelledby="home-title" aria-describedby="scene-label">
      <p class="visually-hidden" id="scene-label">${esc(sceneLabel(false))}</p>
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
// Right: the inventory grid: square slots, then just enough empty ones to finish the last
// row (inventory.js hides the rest, since how many fit a row depends on the width).

const MAX_EMPTY = 7; // the most a row can need (the widest grid is 8 across)

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
  const empty = MAX_EMPTY;
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
              <a class="pix-btn" data-d="prev" href="#/projects" aria-label="${esc(ui.prevItem)}" data-tip="${esc(ui.prevItem)}">&lt;</a>
              <span data-d="count"></span>
              <a class="pix-btn" data-d="next" href="#/projects" aria-label="${esc(ui.nextItem)}" data-tip="${esc(ui.nextItem)}">&gt;</a>
            </div>
          </div>
          <figure class="viewer">
            <button class="viewer-stage" type="button" data-open-gallery aria-label="${esc(ui.openGallery)}"><img data-d="img" alt=""><video data-d="video" muted loop playsinline preload="none" hidden></video><span class="veil" aria-hidden="true"></span><span class="viewer-zoom" aria-hidden="true">${esc(ui.openGallery)}</span></button>
            <div class="viewer-bar">
              <figcaption class="viewer-caption" data-d="caption"></figcaption>
              <div class="viewer-controls" data-d="controls">
                <button class="pix-btn" type="button" data-prev-img aria-label="${esc(ui.prevImage)}" data-tip="${esc(ui.prevImage)}">&lt;</button>
                <span data-d="img-count" aria-live="polite"></span>
                <button class="pix-btn" type="button" data-next-img aria-label="${esc(ui.nextImage)}" data-tip="${esc(ui.nextImage)}">&gt;</button>
              </div>
            </div>
            <div class="thumbs" data-d="thumbs"></div>
          </figure>
          <p class="detail-meta" data-d="meta"></p>
          <h2 class="detail-title" id="detail-title" tabindex="-1" data-d="title"></h2>
          <p class="detail-outcome" data-d="outcome"></p>
          <div class="detail-links" data-d="links"></div>
          <p class="detail-wield" data-d="wield"><span class="gem" aria-hidden="true"></span><span data-d="wield-text"></span></p>
          <p class="detail-flavor" data-d="flavor"></p>
          <dl class="detail-facts">
            <div><dt>${esc(ui.problem)}</dt><dd data-d="problem"></dd></div>
            <div><dt>${esc(ui.built)}</dt><dd data-d="built"></dd></div>
            <div><dt>${esc(ui.tech)}</dt><dd><ul class="tags" role="list" data-d="tech"></ul></dd></div>
            <div><dt>${esc(ui.role)}</dt><dd data-d="role"></dd></div>
          </dl>
          <p class="detail-note" data-d="note"></p>
        `, 'data-detail role="region" aria-labelledby="detail-title"')}
        <dialog class="gallery" data-gallery aria-label="${esc(ui.gallery)}">
          <figure class="gallery-figure">
            <img data-gl="img" alt="">
            <video data-gl="video" muted loop playsinline controls preload="none" hidden></video>
            <figcaption data-gl="caption"></figcaption>
          </figure>
          <div class="gallery-bar">
            <button class="pix-btn" type="button" data-gl-prev aria-label="${esc(ui.prevImage)}" data-tip="${esc(ui.prevImage)}">&lt;</button>
            <span data-gl="count" aria-live="polite"></span>
            <button class="pix-btn" type="button" data-gl-next aria-label="${esc(ui.nextImage)}" data-tip="${esc(ui.nextImage)}">&gt;</button>
            <button class="pix-btn" type="button" data-gl-close>${esc(ui.close)} <kbd>Esc</kbd></button>
          </div>
        </dialog>
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
          <p class="inv-count"><span>${list.length} ${esc(list.length === 1 ? ui.item : ui.items)}</span><span data-equipped-line></span></p>
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

// Each skill's slot shows its name; its flavor line is its tooltip (the shared one,
// ui/tooltip.js: the name over the flavor), which a screen reader hears as its description.
// A slot does nothing else, so a tap (a touch screen has no hover) opens it too.
export function renderSkills() {
  let n = 0;
  return `
    <section class="screen screen-skills side-left" data-screen="skills" aria-labelledby="skills-title" hidden>
      ${panel('page-panel', `
        ${screenHead('skills')}
        <div class="skill-groups" data-skill-grid>
          ${shown(skills).filter((g) => shown(g.items).length).map((g) => `
            <div class="skill-group">
              <h2>${esc(g.group)}</h2>
              <ul class="slots" role="list">
                ${shown(g.items).map((s) => {
                  const id = `skill-flavor-${++n}`;
                  return `
                  <li data-nav-item>
                    <button class="slot" type="button" data-skill="${esc(s.name)}" data-tip-title="${esc(s.name)}" data-tip="${esc(s.flavor)}" data-tip-tap aria-describedby="${id}">
                      <span class="slot-glyph" aria-hidden="true">${esc(s.glyph)}</span>
                      <span class="slot-label">${esc(s.name)}</span>
                    </button>
                    <span class="visually-hidden" id="${id}">${esc(s.flavor)}</span>
                  </li>`;
                }).join('')}
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
          ${site.resumeUrl ? `<li data-resume hidden><a class="contact-link" ${resumeAttrs()}>
              <span class="contact-label">${esc(ui.resume)}</span>
              <span class="contact-value">PDF</span>
              <span class="contact-arrow" aria-hidden="true">&gt;</span>
            </a></li>` : ''}
        </ul>
        <footer class="site-footer">
          <p>${esc(contact.footer)}</p>
          <a href="#/" class="text-link">${esc(contact.backToTop)}</a>
        </footer>
      `)}
    </section>`;
}
