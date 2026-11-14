# S1 and S2: what the spikes showed

Two spikes for [NEWT in Bonfire Live](../../invitation-live.md), run 2026-11-09 before any
Codex work. Throwaway code, kept so the captures can be made again.

## S1: NEWT, a letter and the elements through the bonfire's pass

`s1.html` + `s1.js` build the minimum by hand: the bonfire's own `createFrame` +
`createPixelPass`, a page (a Lambert plane under a hemisphere and a shadowed directional),
NEWT (`loadCharacter` with `pixel: false`), a letter built from a copy of the envelope's
builders (sRGB tones and alpha 1.0, as it is today), its petals, and the fire, lightning and
ice rings built as `sceneModel.js` builds them. `shoot.mjs` drives it frame by frame and
writes every PNG here and `s1-report.json`. To run it again: `npx vite --port 5199`, then
`S1_CHROME=/opt/pw-browsers/chromium node docs/design/captures/newt-live-s1/shoot.mjs`
(`S1_CHROME` only where Playwright's own browser is missing).

| Page | Letter | Fire ring | Lightning ring | Ice ring |
| --- | --- | --- | --- | --- |
| White | [white-1](white-1-letter.png) | [white-2](white-2-fire.png) | [white-3](white-3-lightning.png) | [white-4](white-4-ice.png) |
| Cream | [cream-1](cream-1-letter.png) | [cream-2](cream-2-fire.png) | [cream-3](cream-3-lightning.png) | [cream-4](cream-4-ice.png) |
| Dusk | [dusk-1](dusk-1-letter.png) | [dusk-2](dusk-2-fire.png) | [dusk-3](dusk-3-lightning.png) | [dusk-4](dusk-4-ice.png) |
| Night | [night-1](night-1-letter.png) | [night-2](night-2-fire.png) | [night-3](night-3-lightning.png) | [night-4](night-4-ice.png) |

Looks, held still on White and Night: `white-5-look-*.png`, `night-5-look-*.png` (glitch,
glow, ink, mirror, painterly).

What it showed:

1. **NEWT reads as himself in six spare palette slots** (K3's first branch). Hair, skin,
   plaid and trousers come through; his face picks up a dither speckle. His tones, from
   k-means over his texels in a plain render: mean error 21.6 at four tones, 13.6 at six,
   11.2 at eight, 9.9 at ten.
2. **No palette slot may sit near the page's color.** The pass dithers ±0.08 before it
   snaps, so a tone near the page makes the whole page shimmer: seen on White with a
   near-white tone, and on Dusk and Night with his darkest greys.
3. **Fire and lightning vanish on light pages.** On White and Cream the fire ring leaves
   grey smoke and ash that read as dust, and the lightning ring all but disappears. The ice
   ring's crystals are solid and outlined, and read well. On Dusk and Night all three read,
   the lightning best. So Dusk is the recommended default page, and light pages play every
   element as ice.
4. **The page goes on the ghost layer, with no fog.** On the solid layer the page's far edge
   is outlined in ink as a horizon; fog on this pass draws a band of the ink across dark
   pages (`s1.html?fog=on` shows it). On the ghost layer with no fog the page meets the void
   with no seam on every page, and NEWT is outlined as on the void.
5. **The ink look floods a light page** with the core's gold (it dithers toward "the void
   and the flame's core", made for a dark void). Glitch, mirror, painterly and glow read on
   both pages. Ink is Off on light pages.
6. **The letter reads** with its outline and its flap's V, no stray creases at alpha 1.0; it
   is washed out (sRGB tones read as linear), as task R2's look seam predicts.

Not covered here: the wax seal placed on the texel grid (the spike doesn't run the toy's
seal placement; W2a checks it) and the tablet under the pass (W1b's captures).

## S2: lifting and dropping him with no finger

`s2-carry.mjs` runs the toy's real brain, body (`play.js bodyStep`) and talk in node, with no
character and no DOM, and sends the show's two moments as the toy's own gesture events: a
grab at build stage 4, lifting him 0.6 m over half a second, and a release with a short toss
on the drop's strike. Its output is `s2-printout.txt`.

1. **It works with no pointer:** held → fall → land on all 2,000 seeded drops, lifted 0.65 m
   (he is 1.0 m tall).
2. **Hold about two bars.** At content.json's chances the drop gets `dropped` or `landed` on
   54 % of drops with a two-bar hold, 35 % with one bar (the `pickedUp` line is still up at
   the strike and blocks its equals), 38 % with four.
3. **A long hold brings `thrash`**, his own line for thrashing while held: 0 % at one bar,
   11 % at two, 70 % at four. It's the behavior it goes with in the toy, so the plan now
   counts it among the lines this world uses.
4. **A grab and release a frame apart** (the earlier plan) plays only `pickedUp`, over a lift
   nobody sees.
