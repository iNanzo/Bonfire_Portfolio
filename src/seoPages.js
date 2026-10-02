// What crawlers and link previews see, page by page (used at build time by vite.config.js;
// seo.js keeps the title and description current once the app runs).
//
// Every route is its own copy of index.html (GitHub Pages has no rewrites), so each copy
// gets its own <title>, description, canonical URL, social preview (Open Graph + Twitter
// card, with a 1200×630 image made from the project's cover) and structured data
// (JSON-LD: the person and the site on the home page, a creative work per project).
// The sitemap lists every page that's meant to be found; hidden projects are left out.
import { site, screens, items, sections } from './content.js';
import { esc } from './html.js';

const clean = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const abs = (path) => new URL(path.replace(/^\//, ''), site.url.endsWith('/') ? site.url : `${site.url}/`).href;

/** The social preview image of a page, as a path under the site ("og/<name>.jpg"). */
const ogImagePath = (name) => `og/${name}.jpg`;

/**
 * Metadata for one route: { path, title, description, image, type, jsonLd }. `route`:
 * 'home', a screen id, or 'projects/<id>'.
 */
export function pageMeta(route) {
  const person = {
    '@type': 'Person',
    name: site.name,
    url: site.url,
    email: `mailto:${site.email}`,
    sameAs: Object.values(site.links ?? {}),
  };
  if (route === 'home') {
    return {
      path: '/',
      title: site.title,
      description: site.description,
      image: ogImagePath('home'),
      type: 'website',
      jsonLd: [
        { '@context': 'https://schema.org', ...person },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url },
      ],
    };
  }
  const [screenId, itemId] = route.split('/');
  if (itemId) {
    const p = items().find((x) => x.id === itemId);
    if (!p) return null;
    const year = /\d{4}/.exec(p.year ?? '')?.[0];
    return {
      path: `/projects/${p.id}/`,
      title: `${p.name} — ${site.name}`,
      description: clean(p.summary || p.built),
      image: ogImagePath(`project-${p.id}`),
      type: 'article',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          name: p.name,
          description: clean(p.summary),
          genre: p.kind,
          ...(year ? { dateCreated: year } : {}),
          keywords: (p.tech ?? []).join(', '),
          image: abs(ogImagePath(`project-${p.id}`)),
          url: abs(`/projects/${p.id}/`),
          creator: person,
        },
      ],
    };
  }
  const screen = screens.find((s) => s.id === screenId);
  if (!screen) return null;
  const s = sections[screenId] ?? {};
  return {
    path: `/${screenId}/`,
    title: `${screen.label} — ${site.name}`,
    description: clean(s.intro || s.flavor || site.description),
    image: ogImagePath('home'),
    type: 'website',
    jsonLd: [],
  };
}

/**
 * index.html with a page's own metadata in its head. The tags it rewrites may have their
 * attributes split over lines (as a formatter wraps a long one): any whitespace between
 * them matches.
 */
export function withMeta(html, meta) {
  const url = abs(meta.path);
  const image = abs(meta.image);
  const tags = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:site_name" content="${esc(site.name)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...meta.jsonLd.map(
      (d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`,
    ),
  ]
    .map((t) => `    ${t}`)
    .join('\n');
  // (Replacement functions, not strings: a "$" in a title or summary would read as a pattern.)
  const set = (value) => (_, open, close) => `${open}${value}${close}`;
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, set(esc(meta.description)))
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, set(esc(meta.title)))
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, set(esc(meta.description)))
    .replace(/(<meta\s+property="og:type"\s+content=")[^"]*(")/, set(esc(meta.type)))
    .replace('</head>', () => `${tags}\n  </head>`);
}

/** Every route meant to be found: home, each screen, each shown project. */
export function publicRoutes() {
  return [
    'home',
    ...screens.filter((s) => s.id !== 'home').map((s) => s.id),
    ...items().map((p) => `projects/${p.id}`),
  ];
}

/** sitemap.xml for the routes (plus any extra paths, like the visualizer). */
export function sitemap(routes, extra = []) {
  const urls = [...routes.map((r) => pageMeta(r)?.path).filter(Boolean), ...extra].map((p) => abs(p));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}
