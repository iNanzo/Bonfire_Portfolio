// Per-route document metadata: title, description and canonical URL, kept current as the
// app moves between screens (each route's page is built with its own too: seoPages.js).
import { site, screens, items } from './content.js';
import { routePath } from './routes.js';

function ensure(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.append(el);
  }
  return el;
}

export function updateMetadata(route, base = '/') {
  const screen = screens.find((s) => s.id === route.screen);
  const item = route.item ? items().find((p) => p.id === route.item) : null;
  document.title = route.screen === 'home' ? site.title : `${item?.name ?? screen.label} — ${site.name}`;
  document.head.querySelector('meta[name="description"]')?.setAttribute('content', item?.summary ?? site.description);
  const canonical = ensure('link[rel="canonical"]', () =>
    Object.assign(document.createElement('link'), { rel: 'canonical' }),
  );
  canonical.href = new URL(routePath(route, base), location.origin).href;
}
