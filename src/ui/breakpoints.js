// Where Bonfire Live and the Painter switch to their phone layouts, named once. A script
// asks `innerWidth < NARROW`; a style sheet can't import this, so its media queries say
// `max-width: 759px` (one pixel under, so the two agree at exactly 760) with a comment
// pointing here. Change one, change the other.

/** Narrower than this (CSS px) is a phone: Live's HUD and settings, the Painter's bottom sheet. */
export const NARROW = 760;
