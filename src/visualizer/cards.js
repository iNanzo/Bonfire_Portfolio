// Bonfire Live's title cards: the main one (the set's title, as an intro and on drops), the
// ones that take turns with it on drops or show every 32 bars or on their key (Shift+1…9),
// and a preset scene's name, smaller, which waits for a card of yours that's showing. Each is
// copied into the output window as it comes and goes (ctx.mirrorCard).
import { q } from '../ui/shell.js';

/**
 * The title cards' part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createCards(ctx) {
  const { settings } = ctx;

  // Card 0 is the main one (settings.title/subtitle); 1… are settings.cards. `show` says when
  // each of the others comes up: on drops (taking turns with the main one, if it shows on
  // drops), every 32 bars, or only on its key.
  const titleCard = q('[data-title-card]');
  let titleTimer = 0;
  const cardAt = (n) => (n === 0 ? { title: settings.title, subtitle: settings.subtitle } : settings.cards[n - 1]);
  const turns = { drops: 0, phrases: 0 };
  /** The next card whose turn it is for `when` (drops | phrases), if any. */
  function nextCard(when) {
    const pool = [];
    if (when === 'drops' && settings.titleOnDrop && settings.title.trim()) pool.push(0);
    settings.cards.forEach((c, i) => {
      if (c.show === when && c.title.trim()) pool.push(i + 1);
    });
    if (!pool.length) return;
    showCard(pool[turns[when]++ % pool.length]);
  }
  let cardUntil = 0; // (performance time) when the card showing goes
  let sceneCardNext = null; // a scene's card waiting for the one showing to go
  /**
   * Show card `n` (0 the main one), or a card of its own ({ title, subtitle, scene }: a
   * preset scene's name, smaller, which waits for a title card of yours that's showing).
   */
  function showCard(n, { ms = 3600 } = {}) {
    const card = typeof n === 'number' ? cardAt(n) : n;
    if (!card?.title?.trim()) return;
    const now = performance.now();
    if (card.scene && !titleCard.hidden && !titleCard.classList.contains('is-scene') && now < cardUntil) {
      sceneCardNext = card;
      return;
    }
    titleCard.classList.toggle('is-scene', !!card.scene);
    q('[data-title-main]').textContent = card.title;
    q('[data-title-sub]').textContent = card.subtitle ?? '';
    q('[data-title-sub]').hidden = !card.subtitle?.trim();
    titleCard.style.setProperty('--kindle-time', `${ms}ms`);
    titleCard.hidden = true;
    void titleCard.offsetWidth;
    titleCard.hidden = false;
    cardUntil = now + ms;
    ctx.mirrorCard();
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => {
      titleCard.hidden = true;
      ctx.mirrorCard();
      const next = sceneCardNext;
      sceneCardNext = null;
      if (next) showCard(next, { ms: 2600 });
    }, ms);
  }

  return { showCard, nextCard };
}
