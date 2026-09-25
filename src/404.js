import './styles.css';
import { applyCssPalette } from './palette.js';
import { notFound } from './content.js';
import { esc } from './render.js';

applyCssPalette();

// Two-frame pixel flame (SVG rects), flickering in steps.
const flame = `
  <svg viewBox="0 0 10 12" shape-rendering="crispEdges" aria-hidden="true">
    <g fill="var(--accent-lo)"><path d="M4 1h2v1H4zM3 2h4v2H3zM2 4h6v4H2zM3 8h4v1H3z"/></g>
    <g fill="var(--accent)"><path d="M4 4h2v4H4zM5 3h1v1H5z"/></g>
    <g class="f2" fill="var(--accent)"><path d="M5 0h1v1H5zM3 5h1v2H3z"/></g>
    <g fill="var(--c-wood)"><path d="M1 10h8v1H1zM2 9h2v1H2zM6 9h2v1H6z"/></g>
  </svg>`;

document.getElementById('app').innerHTML = `
  <main class="lost">
    <div class="lost-inner">
      <div class="lost-flame">${flame}</div>
      <p class="lost-code">404</p>
      <h1>${esc(notFound.title)}</h1>
      <p class="flavor">${esc(notFound.flavor)}</p>
      <p class="body">${esc(notFound.body)}</p>
      <a class="press-start" href="${import.meta.env.BASE_URL}"><span class="cursor" aria-hidden="true"></span>${esc(notFound.cta)}</a>
    </div>
  </main>`;
