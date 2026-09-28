# Bonfire elements & palette tools: design notes

Status: **implemented and verified locally** (2026-09-27).
Source: Newton's request, then a round of feedback with four reference images (a stylized
crystal cluster, a 3D-printed crystal druse, a glowing core with dendritic lightning,
lightning arcs around an energy sphere).

## Requirements

| # | Ask | Where it lands |
| --- | --- | --- |
| E1 | Elements that reuse the flame colors | Fire / lightning / ice; every one reads the current flame ramp |
| E2 | Lightning: a tesla ball without the casing | `src/bonfire/plasma.js` |
| E3 | …and a lightning ring across the ground instead of fire | `src/bonfire/lightningRing.js` |
| E4 | Ice: encased in glowing ice shards that form from the ground | `src/bonfire/ice.js` (`createCrystals`) |
| E5 | …and a ring of shards that expands and retracts outward | `src/bonfire/ice.js` (`createIceRing`) |
| E6 | Update the admin | Elements, Lightning and Ice sections, starting element, "Try It" |
| E7 | Palette randomizer that picks colors that work together, a fully random option, suggestions from a picked color | `src/paletteGen.js`, `admin/ui/paletteTools.js` |
| F1 | Filaments end naturally: dissipate, or strike what they hit | Contact test against the height map; free ends fade into dendrites |
| F2 | Lightning light behaves as expected | Cast light moves into the ball and strobes; lights at strikes |
| F3 | Ice: natural formation, a little translucent, subtle glow | Druse layout, irregular faceted crystals, screen-door translucency |
| F4 | A tuft of chill on the ice slam and ring | `src/bonfire/chill.js` |
| F5 | A crackle of lightning from the bonfire | Crackle bolts from the ball to the scenery on impact (and on stoke) |
| G1 | Lightning more violent, powerful, visually impressive (Unity reference) | Heavy ribbon bolts, constant ground strikes that crawl along the ground, a scene flash on discharges |
| G2 | Light from where lightning collides | A point light, a glow and sparks at every strike; the strongest four get lights |

## Key decisions

- **Element is a third part of the fire's state** (weapon + flame + element). It's drawn
  with every roll and changes at impact, like the flame. Draws are weighted
  (`effects.elements.*.weight`, only elements `rotation: true`). Home and reload bring
  back `startingEquipment.element` (optional; missing means fire, so older content
  still validates).
- **Names.** The fire's name swaps the flame's trailing "Flame" for the element name:
  Azure Flame → Azure Lightning. Flame names stay as authored.
- **One scene, all elements live.** Each element module eases itself in and out
  (`setActive`), so a change is a transition: the fire dies down as the ball grows, and
  the crystals sink back as the fire relights. The flame's spawn rate is gated, not
  destroyed. Inside the ice the fire burns low (`ice.innerFire`).
- **Contact from the height map.** The fireflies' height map (`terrain.top`) already
  covers the logs, stones, pillar and walls. Filaments march it (12 steps + a short
  refine) to find strike points cheaply, every frame. It only records top surfaces, so
  a filament can strike only after passing through open air. Otherwise the core,
  which hangs inside the logs' teepee, would "hit" at once.
- **Translucent ice without sorting.** Crystals are instanced solid geometry on the
  outlined layer. Their translucency is a screen-door dither locked to the pixel grid
  (clear face-on, opaque edge-on). It needs no blending order, keeps depth for the
  particle depth test, and matches the site's dithered look.
- **Chill is smoke that sinks.** It uses the normal-blended smoke material in the color
  pass, low opacity and many specks, so the palette dither turns it into a veil. The
  mist falls to the height map and spreads.
- **Thick bolts are screen-space ribbons.** Each segment is a quad expanded in the
  vertex shader to a width in scene pixels, with a one-texel white-hot center (which
  carries heat, so the pixel pass burns it toward the flame's core color) and a dithered
  glow. Quads overlap at joints; the material is double-sided because the winding
  follows each bolt's direction. Thin branches stay 1-texel GL lines, which never gap.
- **Flashes stay safe.** Resting strikes light only their own spot (small area). A
  whole-scene flash (exposure plus cast light) happens only on a discharge (an impact
  or a stoke), at most one every 450 ms. Bright strobe snaps of the cast light are
  limited to about three a second. Reduced motion turns flashes and snaps off.
- **Palette algorithm in OKLCH.** Each ramp step has a lightness band. Chroma is a share
  of the gamut's maximum at that lightness and hue, so every hue is equally vivid and
  nothing clips. Hue comes from the scheme; "hue shift" (shadows toward blue-violet,
  highlights toward yellow) is the default. At hue 45° it reproduces the hand-tuned
  Ember flame closely (tested). `hi` is lightened to 4.5:1 on the background. Scene
  palettes keep lightness order and darken the background until every flame's text
  reads.
- **Palette tools are ordinary edits.** They go through the draft (Discard still works),
  with a per-flame / per-block Undo history, and the preview recolors the fire in place
  (`nh:flame` with `instant`) so each change shows at once.

## Settings (`effects`)

```jsonc
"elements":  { "fire" | "lightning" | "ice": { "name", "rotation", "weight" } },
"lightning": { "size", "height", "filaments", "strikes", "boltWidth", "jag", "branches", "crackle", "drift",
               "brightness", "cursorPull", "flicker", "ringSpeed", "ringArcs" },
"ice":       { "shards", "height", "spread", "thickness", "clarity", "glow", "shimmer",
               "innerFire", "frost", "growTime", "ringSpeed", "ringHeight", "ringHold" }
```

All of these apply live in the preview; no counts resize GPU buffers (pools are sized for
the ranges' maximums).
