# The knight, the Portfolio page and the render menu: design notes

Status: **implemented and verified locally** (round 8, 2026-09-29; round 9, 2026-09-30:
his arrival by a summon sign, the seats moved out of the fire, the fire's natural light
and no gold, the Knight Styles with the 2D pixel-art look as the default, the pauldrons on
their own nodes with springs, the seated gestures redone, the Default Dance, knight options
in the admin, the pack, Bonfire Live and the Painter's scenes; not yet committed).
Source: Newton's request with five reference images: a pixel-shaded low-poly character
(the target look: "compatibility with 2D shaders"), a low-poly knight in a great helm, a
low-poly knight in a pointed helm with cross-shaped eye slits, the Dark Souls knight
resting against a tree in a great helm, and Vilhelm of Londor's concept art (black
fluted plate with gold trim, an armet).

## Requirements

| # | Ask | Where it lands |
| --- | --- | --- |
| K1 | A project item for the Portfolio itself; the live-site breakdown lives there | `content.json` `projects` → `portfolio`; "Take This Page Apart" moves from Bonfire Live |
| K2 | The P render menu inside the breakdown and in Bonfire Live | `src/ui/renderMenu.js`, shared by the site's HUD, the breakdown and the visualizer |
| K3 | The breakdown keeps the backpack | The pack stays visible and usable while the page is taken apart |
| K4 | A low-poly knight: no cape, no weapon, no shield | `tools/knight.py` → `public/models/knight.glb` |
| K5 | One armor set, after Vilhelm's (without the mantle) | Fluted plate, mail at the joints; steel with no gold since round 9 (round 8's gilt bands, `K_Trim`, draw as raised steel; only the Black & Gold and First Build styles still gild them) |
| K6 | Three helmets: a great helm, an armet, the pointed helm with cross slits | `K_Helm_Great`, `K_Helm_Armet`, `K_Helm_Bascinet` |
| K7 | The knight sits at the bonfire, placed for the pose in every scene | A seat per scenery (`src/bonfire/knights.js`; `SEATS` in `src/bonfire/knightPlaces.js`, re-exported by `scenery.js`, which builds the new seats) |
| K8 | Bonfire Live: the knight dances at the right moments, is sometimes not there, several can dance round the fire | `src/visualizer/knightShow.js`, the Knights tab |
| K9 | Armor that looks good through the pixel pass and catches the light in a cool way | The armor material (`src/bonfire/armor.js`) |
| K10 | More settings in Bonfire Live, rendering among them | A Render tab; every effect Off / In the mix / Always |
| K11 | Round 9: not there on first load (too distracting); something triggers his arrival; coming and going is the weapon swap's dissolve in the current element's way | His summon sign, the NH monogram on the ground by his seat (`src/bonfire/summonSign.js`); `src/bonfire/knightArrival.js` (away → arriving → resting → leaving); the swap's forge on any subject (`src/bonfire/forgeRun.js`); he leaves after a long rest (3–5 minutes by default, the admin's *Shortest Rest* and *Longest Rest*) or when the pack sends him off, and each summon wears a helmet drawn at random (**His arrival**) |
| K12 | Round 9: "his feet are in the bonfire" (every scenery) | The seats moved back (`SEATS`), his boots ≥ 1.05 m from the fire's middle |
| K13 | Round 9: the cult's sigils become the NH logo | `sigil()` in `scenery.js`, from `LOGO_STROKES` (`src/ui/logo.js`) |
| K14 | Round 9: "the lighting to be more natural … the edges of the armor should always reflect the color of the bonfire subtly … the light overall should fade as it heads towards the back of the knight" | The fire as his one key light, falling off with its turn and distance to a dim cold fill on his back, and his silhouette's edge in the flame's color, stronger on the fire's side (`armor.js`, `pixelPass.js` rim; *Edge Glow*, `setRim`); **The look** and **Material** below |
| K15 | Round 9: "remove the yellow trim" | No gold in any style but the two kept from round 8 (K5) |
| K16 | Round 9: "a nice neutral texture … lean towards a gunmetal grey … best practices for material metal in a 3d pixelart pipeline" | A steel ramp of his own (`steel.js`), metal as reflection, texture at the scale of the plates (a fine noise judged and dropped: **Material**) |
| K17 | Round 9 (after the Variante references): "render it more like a 2d pixel art character", "it still doesn't look like that knight is reflecting the color of the bonfire" | The pixel styles, *Pixel Cel* the default: smooth plates in flat bands with line art, the lit planes in the flame's own colors (**Knight Styles**) |
| K18 | Round 9: "knight options overall for the portfolio and visualizer", "knight model version options based on what we've generated already" | Every look he has had is a Knight Style (`knightStyles.js`); style, finish, edge glow, seat pose and helmet in the admin (`effects.knight`), the pack (a visitor's picks) and Bonfire Live's Knights tab; a Painter scene sets them for its knights |
| K19 | Round 9: "pauldron movement is lacking" | The lames on their own nodes (`K_Pauldron_*`), a swing-twist follow of the arm with a lift and roll above level, kept out of the helmets (`knightPose.js` `PAULDRON`, `clampPlates`), and a spring on the plates (`knights.js` `SPRUNG`) |
| K20 | Round 9: "some sitting animations especially don't look good" | Seated gestures sit up first and aim in the room (no cocked helm, no facepalm), a shallower bow, Praise thrown up over four steps, feet stepped (never slid), a softer doze; the seat poses *Resting* and *Watchful* |
| K21 | Round 9: "Can we add the fortnite default dance to dance options?" | `defaultDance` (8 beats, a seated version) among Bonfire Live's moves; on the site a pack gesture: he stands, dances two bars and sits back down (`dance`); on a phone's tall view, which frames his seat right under the page's header, he dances it in his seat (`headroom`) |

## The look

The first reference is the bar: a low-poly figure rendered small, with clean outlines and
a few flat tones per material, so it reads as a hand-made sprite. For the knight that means:

- **Chunky, heroic proportions** (like the reference's big gloves and boots): a helmet a
  little oversized, big layered pauldrons, a globose breastplate over a narrow waist,
  thick cuisses and greaves, big flared gauntlets and long pointed sabatons. About
  1.73 m standing (great helm), so a seated knight is about 90 texels tall at the home
  view and about 1.15–1.2 m to the helmet top.
- **Faceted, flat plates** (the low-poly references): every plate a few big facets, so
  each facet catches the light on its own. Round parts use 8–16 sides; Vilhelm's flutes
  are real facets.
- **Pixel-safe detail**: nothing under about 2.5 cm (trim bands, slits), flutes at least
  3 cm apart, closed solids, no coplanar faces, no hair-thin gaps (the scenery rules at
  the top of `src/bonfire/scenery.js`).
- **Gunmetal plate lit the way a fire lights it** (round 9; no gold anywhere): a steel
  ramp of his own (five cool greys, `src/bonfire/steel.js`), walked by the fire's light as
  it really falls: brightest on the side facing the fire, fading across the turning edge,
  the back only in the cold sky's and moon's dim fill. Metal is mostly reflection, so a
  broad sheen, the warm ground near the fire in the facets that mirror it, the flame's
  own `hi` and `core` flashing on the few facets that mirror it (crisp, sparse sweeps
  that recolor with every flame), and a subtle rim of the fire's color on his
  silhouette, stronger on the fire's side. Texture at the scale of the plates, not finer
  (the verdict under **Material**).
- **Drawn like a 2D pixel-art character** (round 9's end-game look, the default since its
  finals: Pixel Cel; after the pixel artist Variante's knights: "render it more like a 2d
  pixel art character", "it still doesn't look like that knight is reflecting the color
  of the bonfire"): the pixel styles (**Knight Styles** under **In the scene**). A low-poly
  render shades every facet on its own, which reads as 3D; a pixel artist shades each
  plate as one curved form in a few flat value bands and draws its edges. So each plate
  is one smooth, rounded surface (its facets' normals averaged, its creases rolled) cut
  into three or four flat bands by one key light, the fire; a 1-texel line on the
  silhouette and on every plate edge, seam and overlap (and none between the fingers'
  faces or a fauld's hoops once they're only a few texels big, none round a sliver or a
  corner poking through, and no stroke shorter than five texels, so it never scribbles);
  near-black masses where the fire can't reach (the far side, under the helm and the
  pauldrons, the overlaps); a domed plate (a pauldron, the great helm's crown) banded
  across its curve like the references' metal: a lit crescent toward the fire with a
  small highlight at its heart, then steel, mids and a dark far side, never one flat disc
  of the flame's color; a crescent of cream on a rounded plate's fire-side curve, small
  glints, bright lips only on the raised edges the fire lights; the wide bands' edges
  dithered in the scene's own Bayer pattern, following the Dither setting (round 10).
  **The key light's color is the fire's**: only the
  planes squarely facing it leave the steel, and those are the flame's own body and cream
  tips, so every flame recolors his lit side while the shadows and mids stay cool
  gunmetal: grey plate lit by that fire, not painted armor. The light falls off steeply
  toward his back; his silhouette catches the fire just inside the outline on the fire's
  side (the flame's shade on the far side). The fire's reflection still flashes (a plate
  facing the fire flashes as a whole into the lit bands) and the sweeps glide over him,
  as in Bonfire Live. Every look he has had stays selectable (the Knight Styles).

## The model (`tools/knight.py`)

Built in Blender like the weapons (`npm run model -- knight`, or `npm run model:knight`;
add `--quick` to skip the renders), exported alone to `public/models/knight.glb` (Draco,
about 125 KB). The build also renders three sheets into `assets/source/` (flat shading,
the cavity drawing the flutes' ridges; posterized, each well under 1 MB):
`knight-preview.png` (front three-quarter, side, back), `knight-helmets.png` (the three
helmets, front and three-quarter) and `knight-poses.png`: the runtime's own poses, from
`knightPose.js` evaluated by node (seated on a 0.38 and a 0.23 m seat, the helmet swap,
Praise the Sun and six dance moves at their extremes), each from his left front, as the
site's home camera sees him and from his right, to check the plates for clipping.
`--judge <dir>` adds review renders of the seated knight: lit by a warm light low in
front and a faint cold moon (EEVEE), and at sprite size (about 90 px, enlarged 4x);
`--look --poses [--judge <dir>]` renders only the poses sheet (for tuning a pose).
`test/knightModel.test.mjs` checks the committed file: the rig, the helmets, the roles,
the rest pose's size and facing, and the budgets.

**Rig.** Rigid pieces on named empties; no skinning in the file. Rest pose standing,
arms hanging 12° out with the palms to the thighs, facing three.js +z (Blender −y), feet
on y = 0, centered on x = z = 0, every joint's rotation zero. `_L` is the knight's left,
+x. Names (three.js):

```
Knight
└ K_Hips
  ├ K_Spine ─ K_Chest ─ K_Neck ─ K_Head ─ K_Helm_Great | K_Helm_Armet | K_Helm_Bascinet
  │            ├ K_Shoulder_L ─ K_UpperArm_L ─ K_Forearm_L ─ K_Hand_L ─ K_Fingers_L
  │            │ └ K_Pauldron_L                (the pauldron's two lames)
  │            └ K_Shoulder_R ─ K_UpperArm_R ─ K_Forearm_R ─ K_Hand_R ─ K_Fingers_R
  │              └ K_Pauldron_R
  ├ K_Tasset_L, K_Tasset_R            (hinged on the hip axis; follow the thighs: JS)
  ├ K_Thigh_L ─ K_Shin_L ─ K_Foot_L
  └ K_Thigh_R ─ K_Shin_R ─ K_Foot_R
```

Each joint's pieces are one mesh, `<joint>_Mesh`, parented to the joint with no offset
and modeled in the joint's own coordinates; each helmet is `K_Helm_*_Mesh` under its
empty, and the empties sit at the head pivot. The root carries `userData.kind = 'knight'`
(and `height`: 1.72). Materials are roles, by name: `K_Plate`, `K_Edge`, `K_Trim`,
`K_Mail`, `K_Leather`, `K_Cloth`, `K_Void` (`armor.js` `ROLES`, in that order). `K_Trim`
marks round 8's gilt bands: only the Black & Gold and First Build styles draw it as trim,
every other style as raised steel like `K_Edge`. The runtime merges each knight into one
rigidly skinned mesh and one per helmet (two draw calls: the body and the helmet he
wears) and gives it the armor material by role.

| Joint | Pivot (three.js x, y, z; m) | Where | Carries |
| --- | --- | --- | --- |
| `K_Hips` | 0, 0.935, 0 | the pelvis | belt and buckle, a fauld of three flared, fluted hoops, the mail skirt, a dark core |
| `K_Spine` | 0, 1.01, −0.005 | the small of the back | the plackart (the narrow waist), a dark waist core |
| `K_Chest` | 0, 1.17, −0.01 | the lower ribs | the globose breastplate with its centre ridge and backplate, the raised neckline and V, mail at the armpits |
| `K_Neck` | 0, 1.385, −0.012 | the base of the neck | the gorget (three lames), a mail neck |
| `K_Head` | 0, 1.465, 0 | the base of the skull | an arming cap; the helmets hang here |
| `K_Shoulder_L` | 0.195, 1.325, −0.01 | the shoulder socket | the pauldron's fluted dome with a raised hem |
| `K_Pauldron_L` | 0.195, 1.325, −0.01 | the same socket (under `K_Shoulder_L`, no offset) | the pauldron's two fluted lames, so they can swing on their own |
| `K_UpperArm_L` | 0.195, 1.325, −0.01 | the same socket | armpit mail, the third lame, rerebrace, couter and its fan |
| `K_Forearm_L` | 0.253, 1.051, −0.01 | the elbow, in the couter | elbow mail, the fluted vambrace |
| `K_Hand_L` | 0.305, 0.807, −0.01 | the wrist | the flared gauntlet cuff with a raised lip, back of the hand, knuckles, thumb |
| `K_Fingers_L` | 0.325, 0.714, −0.01 | the knuckles | the finger block, curled 35° toward the palm |
| `K_Tasset_L` | 0.112, 0.885, 0 | on the hip's axis | two flared, fluted lames hanging in front of the thigh |
| `K_Thigh_L` | 0.1, 0.885, 0 | the hip socket | the thick fluted cuisse, mail behind |
| `K_Shin_L` | 0.105, 0.49, 0.012 | the poleyn's center | knee mail, the poleyn and its wide fan, the greave swelling over the calf |
| `K_Foot_L` | 0.105, 0.095, −0.012 | the ankle | ankle mail, the sabaton, a leather sole |

The `_R` joints mirror x. Arm and leg lengths: shoulder to elbow 0.28 m, elbow to wrist
0.25, wrist to knuckles 0.095 (all along the 12° hang, (±0.208, −0.978, 0)); hip to knee
0.395, knee to ankle 0.395.

**Sizes worth knowing.**
- Helmet tops: great helm 1.728, armet 1.742 (the comb), bascinet 1.779 (the point).
  Helmet bottoms are at 1.39; the bascinet's aventail reaches down to 1.33.
- Across the pauldrons and hands ±0.38; the breastplate is 0.40 across at the chest and
  the waist 0.26; the toes reach z 0.29, the heels −0.10.
- Seated: the backs of the thighs are 0.112 behind the hip sockets, so with the thighs
  level the hips joint is **0.162 m above the seat** (`SEAT_DEPTH`).
- Tassets: hinged on the hip's own flexion axis, level with the socket, so a tasset
  turning with its thigh rides on it. The tasset node's `userData.follow` (0.85) is
  the share that lays them on a seated knight's thighs.
- Pauldrons: domes of 0.14 m over two lames on their own node (`K_Pauldron_*`). The
  runtime keeps every dome and lame out of whichever helmet he wears (the bascinet's
  mail aventail included) in every pose, however high the arm goes (`clampPlates`,
  `test/knightPose.test.mjs`).
- Triangles: body 4620 (budget 5000), great helm 408, armet 600, bascinet 326 (900 each).

**Armor** (Vilhelm's, the small figure without the mantle): a globose breastplate in big
facets with a centre ridge (the keel), a raised hem, a raised neckline and two ribs
rising from the waist in a V; a plackart tucked under it at the narrow waist; a
laminated gorget; big layered pauldrons, a fluted dome with a raised hem over three
fluted lames (the last rides on the upper arm, so the arm never slips out from under
it); rerebraces, couters with side fans, fluted vambraces; gauntlets with a wide flared
cuff and a raised lip, a broad back of the hand, a knuckle ridge, a thumb and a curled
finger block; a leather belt with a steel buckle, a fauld of three flared, fluted hoops
arching up in front over the thighs, flared fluted tassets and a short mail skirt; thick
fluted cuisses with a keel and mail behind, pointed poleyns with wide side fans, keeled
greaves that swell over the calf with a raised band at the ankle, long pointed laminated
sabatons on leather soles; mail at the armpits, elbows, knees, ankles and neck.

**Flutes** where Vilhelm has them, as real facets: every other vertex pushed out 5–7%
(facets at least 3 cm wide, ridges 6–15 cm apart: 3 texels and more at the home view)
on the pauldron domes and lames, the vambraces, the cuisses, the tassets and the fauld's
hoops. The light breaks on them into stripes: through the armor material each facet
takes its own tone by its turn to the fire, and the outline pass draws a crease line
along each ridge. Raised rims (`K_Edge`) step out a centimetre, so they catch a crease
line too.

**Raised bands** (round 8's gold trim, `K_Trim`, drawn as raised steel but in the Black &
Gold and First Build styles; with the `K_Edge` ones): the helmets' rims
and the great helm's cross (the armet's comb and its visor's middle rib), the pauldron
hems, the breastplate's neckline and V, the buckle, the gauntlet cuffs' lips and the
bands above the sabatons, with the breastplate's hem, the gorget, the tassets, the
armet's other visor ribs and its rondel. They step out a centimetre and catch a crease
line and the worn-edge light like every rim.

**Helmets.** Widened 10% and 3% taller (from the bottom rim up) to read a little
oversized, like the references'. Each is a closed shell whose bottom cap is `K_Cloth`
(its dark inside).
- *Great helm* (the resting knight, mainly): a flat-topped bucket with a keeled face,
  raised bands round it, a raised brow band and upright making the cross, the eye
  slit (`K_Void`) either side of the upright, two rows of breaths on each cheek, and a
  raised top rim.
- *Armet* (Vilhelm): a rounded skull with a raised, crested comb, a projecting
  sparrow's-beak visor with a rib down its point (raised ribs either side), the eye
  slit between visor and brow, two breaths on the visor, and a rondel at the back of
  the neck.
- *Bascinet* (the low-poly knight with a cape): a pointed, faceted skull, a flat face
  plate with a center ridge, two horizontal eye slits and two cross-shaped breaths, and a
  short mail aventail.

## In the scene

Built in `src/bonfire/knights.js` (loading, skinning, placing, the API), `knightPose.js`
(every pose, pure and unit-tested), `knightPlaces.js` (the seats, the dance ring, its
places and the walks between them; pure and unit-tested, shared with the visualizer's
`knightShow.js`) and `armor.js` (the material); wired up in `scene.js`.

- **Loading.** `knight.glb` is fetched alongside `bonfire.glb` with the same loader (one
  Draco decoder), and preloaded by both pages. If it fails, or lacks `Knight`/`K_Hips`,
  the fire burns without him: a console warning, never an error, and `fire.knights`
  reports no knights.
- **One mesh.** Each knight is merged into one rigidly skinned mesh (every vertex weight 1
  on its piece's joint) and one for each helmet, sharing one skeleton; the geometry is
  shared between knights. Only the helmet he wears is drawn (the others are hidden, not
  skinned), so two draw calls a knight, and two per shadow cube face he's in: his meshes
  are culled by one fixed sphere in his own space (`BOUNDS`: 1.6 m round a point 1.05 m
  up and 0.15 m forward), which every pose stays inside with 0.2 m to spare
  (`test/knightsBounds.test.mjs` checks the moves, gestures, reactions, seats and walks on
  the real model's pieces). The material role rides on each vertex (`aRole`, from the
  material names). Tassets follow their thighs by the tasset node's `follow` (0.85).
- **The pauldrons** (`knightPose.js` `PAULDRON`) ride the arm like plates on straps: the
  dome takes 0.4 of the arm's swing away from hanging and the lames 0.72 (a raise forward
  or back counts 0.6 of one out to the side, a sweep round at shoulder height 0.45); only
  the swing, never the arm's twist about itself. Above level they lift and roll outward,
  riding up over the shoulder. A dome or lame is never pushed deeper into the helmet than
  the model has it at rest: a head tilted onto a shoulder or an arm swinging them up
  against it shoves the pauldron out from the neck instead (`clampPlates`, at most 5 cm).
  On top, `knights.js` gives the shoulders, lames and tassets a spring (`SPRUNG`, 2.6 Hz,
  damping 0.38, four substeps a 12 fps step, each plate's lag capped at 0.09–0.13 rad): they
  lag, overshoot a little and settle ~0.4 s after a move stops (`moving` stays true while
  they swing, so the shadow follows), then are clamped again.
- **Seats** (`SEATS` in `knightPlaces.js`, re-exported by `scenery.js`). Round 9 moved
  them all back ("his feet are in the bonfire": round 8's were 1.1–1.4 m from the fire's
  middle, his boots on the ring stones at the flames' edge): now behind the fire on the
  left, his hips 1.69–1.78 m from its middle at bearings 208–217° (straighter behind it
  than the plan's 225–240°, so he stays in the phone's narrow frame), his boots 1.31–1.54
  m out (≥ 1.05 m on the real sabatons over his whole idle: `test/knights.test.mjs`; the
  ring stones reach 0.78, the flames 0.45), never over the flames from the home, projects
  or inspect views at 1920, 1280 or 390 wide. The seats are low, 0.21–0.23 m (knees up,
  as a knight rests at a Dark Souls bonfire): that far back, round 8's 0.32–0.40 m seats
  lifted his helmet 7–11 px into the page's header on a 390×844 phone (its bar, 64 px,
  shows once the page scrolls); now the great helm's top stays at 65.8–67.7 px over his
  whole idle (`test/knights.test.mjs`, on the real helmets). The seats: a drum fallen from
  the ruins' pillar, lying half sunk by its plinth (0.21 m; built by `scenery.js` for the
  ruins, the one piece it adds to the model's, named `Static_PillarDrum` so it's a solid,
  casts its shadow and is in the fireflies' height map), a low stump by the forge's anvil
  (0.21; its barrel moved behind the anvil), a low resting stone at the shrine (0.21), the
  cathedral's fallen nave drum, half sunk (0.22; the rubble and floor candles by it moved
  clear of his boots) and the cult's fallen standing stone (0.23; the two black candles
  nearest him stand past his seat). Every moved or new piece keeps its place in its builder, so the seeded rng draws
  the same numbers and nothing else in any scenery moves (checked piece by piece against
  round 8's builder). Each seat's height is checked against the
  scenery's height map when he sits (the table's value if the map disagrees by more than
  10 cm), and each foot's ground under him. The hips joint sits 0.162 m above the seat;
  two-bone IK puts the feet on the ground in front of it, the knees forward and up.
  Every seat is on a blocked arc of the dance ring (`DANCE_RING.blocked`, measured on the
  height maps with his legs), so nobody dances on it; standing up he's 1.32–1.39 m from
  the fire's middle (round 8: 0.74), and every walk from there to the dancers' places on
  his side is clear of the pit.
- **His summon sign** lies in front of each seat (`SEATS[name].sign`: 0.55 m along his
  way, or where that ground is taken, a spot of its own: the ruins' is left of his boots,
  clear of the model's fallen drum), on open ground clear of the ring stones, turned to
  read from the home view, and in view from it on wide screens and phones
  (`test/knightPlaces.test.mjs`).
- **The others** (Bonfire Live) sit on the ground where the visualizer rests them
  (`restPlaces`: the layout for the whole cast less the place nearest the seat, on the
  ring's clear sides, never in front of the fire), their feet on the ring, facing the
  fire; a new scenery, or a new cast, sends them home there.
- **The seated rest** is the Dark Souls bonfire rest: slumped forward over his knees
  (spine 27° to 36° from a 0.22 to a 0.40 m seat), his left foot drawn in and that arm
  laid over the knee with the gauntlet hanging past it, the right leg out with that
  forearm along the thigh and the hand on the knee, the head sunk and tipped aside. That
  keeps his helmet low: on round 9's low seats its top clears the page's header on a
  390×844 phone in every scenery with every helmet (measured on the helmets' own vertices
  over the idle's head movements, `test/knights.test.mjs`; the margin is thin, 1.8–3.7
  px, so a pose that sits him up needs the check). That's the **Resting** seat pose; the
  other is **Watchful** (`SEAT_POSES`, `fire.knights.setSeatPose`): leaning in over his
  knees, forearms on them, both feet planted under them, the head tipped back up to watch
  the fire, dozing less and glancing about more. It's no taller at the helmet than the rest
  (the lean from the hips, 8° + 20° + 8°, the head up by the neck and head alone), and its
  feet are 3.5 cm further in than round 9's first cut: both seat poses clear the phone's
  header (≥ 66.7 px) and keep the boots ≥ 1.05 m from the fire in every scenery with
  every helmet (`test/knights.test.mjs` checks both).
- **Poses** (`knightPose.js`) are flat arrays that blend with a lerp: the hips' offset;
  turns for hips, spine, chest, neck and head; each hand as a direction and reach from
  its shoulder in the chest's frame, with the elbow's turn, the wrist and a fist; each
  ankle as an offset, with the foot's pitch and the knee's turn out. `solve()` does the
  IK (feet stay flat whatever the leg does). They step at the fire's 12 fps; the fire's
  shadow is redrawn (once, in that frame) only on steps with real motion, never for idle,
  and once whenever what casts it changes: he forms or burns away, is put somewhere new
  (a new scenery), or his helmet changes at once (`knights.moving`). Each knight keeps his
  own solved joints (the solver's are shared), so the cameras' heads (`positions`), the
  blade's capsules and his glances are his own.
- **At rest** he breathes, his head sinks over several seconds and lifts with a start,
  he glances about, and every ~12 s shifts his weight, a hand or a foot.
- **Reactions** (from `scene.js`): while a weapon is being forged or the living blade
  flies he sits up and watches it (chest up, head turned to it); `impact()` → a flinch
  (jerks back, head turned away, forearms up, ~1 s); `stoke()` → he leans away, an arm up
  against the heat; `ring()` (and the impact's ring) → he lifts his feet (standing: a
  hop) as the ring's front reaches him. A knight dancing on his feet (or on his way to),
  or throwing his arms up in a cheer (`praise`, `hurrah`, `joy`), doesn't flinch or lean
  away, so the drop's leap and Praise the Sun read whole; he still hops the ring. The
  site's knight reacts by `effects.knight.reactions`; Bonfire Live switches its knights'
  with `fire.knights.setReactions(on)` (the reactions and the watching both). Hovered,
  he looks at the camera and his rim warms (`hoverAt` returns `'knight'`; `knightAt(x, y)`
  gives his index); `hoverAt(x, y, { knight: false })` (the site, when a click wouldn't
  greet him) never picks him, and the fire behind him counts as the fire.
- **Seated gestures** sit him up first, then aim the arms and head in the room (`gesture`
  with `stand` and `room`): the helmet gesture puts his hands at the helm's sides, the bow
  is shallower seated, Praise the Sun throws up over four steps, a seated joy keeps his
  hips on the stone. Where something tall stands at his side (`knights.js` `roomOf`, from
  the height map: the ruins' pillar) Praise and joy throw the arm up in front of him
  instead and the wave changes hands. The head aims in his own space, level with the
  world (split 0.4 neck, 0.6 head), so a hover or a flinch never cocks the helmet.
- **Transitions.** Standing up (1.2 s): a lean with hands to the knees, a push-off, a
  small overshoot as he straightens, the feet moved in small lifted steps (never slid) to
  a level, open spot in front of his seat (`standSpot`). Sitting down: a bend, the hips
  reaching back, a settle. The idle's weight shift lifts the foot it moves too. Walking: 0.95 m/s with a 12 fps gait, along the way `planWalk` finds: straight
  where that's clear of the fire pit (0.72 m) and keeps 0.85 m from the fire (or no nearer
  than his seat's step, where he stands up 1.32–1.39 m from it), and of anything the
  height map says is taller than a step (0.16 m; a hand either side of his path);
  otherwise round the fire, easing out from one end's distance to the other's. Only a
  way longer than 2.4 m or blocked both ways goes by ember: he burns away and forms at
  the other end. From his seat to every dancer's place on his side of the fire (and
  back) is a walk in every scenery; only the far side (across the front) is by ember.
  Changing scenery: he forms at the new seat out of embers (feet first, ~0.55 s, a flash
  in his own tones as he completes); a knight being sent away just then is gone at
  once instead (the show's drop that sends dancers off and moves the fire). Summoned
  while going somewhere by ember (`state` `'ember'`), he carries on; asked to dance while
  burning away, he forms again and goes.
- **Knight Styles** (`src/bonfire/knightStyles.js`, pure): every look he has had, one
  name each, selectable at any time; how the armor draws him (`armor.js`, the shader's
  `uLook`), which model he's built from, and which colors the pass snaps his steel to.
  `STYLES` (`look`, `model`, `finish`, `dither`, `hint`), `STYLE_KEYS` (menu order),
  `STYLE_NAMES` (Title Case labels), `DEFAULT_STYLE`, `MODELS`, `styleOr(name)`,
  `styleModel(name)`. `dither` is how far a pixel style dithers its band edges at the
  site's Dither (0..1; **Dither** below): Pixel Cel and Pixel Painterly 1, Pixel
  Chiaroscuro 0.2, the rest 0.

  | Key | Name | What |
  | --- | --- | --- |
  | `pixel-cel` | Pixel Cel | **the default**: the sprite, four flat bands and a highlight on smooth plates (cool gunmetal darks and mids, the flame's body and cream tips only where it faces the fire), the wide bands' edges dithered, near-black ink with a dark warm ink over the lit tones, the fire on his outline's fire side |
  | `pixel-painterly` | Pixel Painterly | the sprite with a painter's touch: shadows hue-shifted toward the flame's shade (as dark), lips a little further round the lit edges, a lighter ink over the lit tones, the flame's dark shade on the terminator, the band edges dithered as Pixel Cel's |
  | `pixel-chiaroscuro` | Pixel Chiaroscuro | hard firelight: the dark, mid steel and the fire's body (and the highlight), near-black backs and gaps, black ink, the terminator, a little dither |
  | `gunmetal` | Gunmetal | round 9's natural light on gunmetal steel (below) |
  | `blackgold` | Black & Gold | round 8's final: blackened plate in the scene's stone, shadow and void by each facet's turn to the fire, dark gilt trim (wood and shadow) that catches the flame's mid, hi and core only in its reflection, rims a step up; no steel ramp, no fire rim |
  | `first` | First Build | round 8's first build: its own boxy model (`public/models/knight-first.glb`, no `K_Pauldron` joints: its lames ride the dome), fetched only when chosen; the same blackened plate, its trim at least the flame's `lo`, so it glows in the flame's color |

  The site reads `effects.knight.style` (the default when unset: `DEFAULT_STYLE`);
  `fire.knights.setStyle(name | null, { instant })` sets one over it (null: the settings'
  again) and resolves true once it shows, `fire.knights.style` reads it. A knight who's
  here burns away from the top and forms again in the new style (~1.2 s: the helmet
  swap's dissolve over his whole body, with sparks and a flash; all present knights at
  once; instant under reduced motion). The flash as he forms (a style, a helmet, an
  arrival by ember) is in his own tones (the armor's `uLift`: his bands a step or two up,
  into the flame's only on the side facing it, fading in ~0.5 s), never a wash of one
  color over him (the forge's lightning `uGlow` ends as he stands whole): no flat
  silhouette at the end of a swap. A style with its own model fetches it first and builds
  its template once (`knights.js` `templateSteps`, a step at a time in idle moments, then
  `adoptTemplate`: on the same rig, each piece moved from its joint's rest place there to
  the knight's; the rig, the solver and the plates' collision data stay the knight's).
  Asked for at once (`instant`, as Bonfire Live does at a hidden moment) before that's
  ready, he burns away and forms in it when it is, never popping in whole a moment late; a
  repeat call while it loads waits on the same swap. Bonfire Live and the Painter get every
  such model ready in idle moments once their knights are in, and
  `fire.knights.prepareStyle(name)` does it on demand. The steel finishes are the color
  option within the styles that draw steel (`finish: true`: the pixel styles and Gunmetal).
  **The pixel styles** (`uLook` 1..3; `knights.js` builds their data from the model,
  once per model, ~0.1 s). Faces are joined into smooth surfaces across every edge turning
  less than 64° (the model's facets bend up to ~60° round a curve, its creases and box
  edges 70° and more), welded by position across materials. Per corner: `aSmooth`, the
  surface's normals averaged by area there, turned 0.55 of the way toward the surfaces
  across a crease (so a plate rolls at its edges: a flat crown lights at its front lip and
  falls off at its back); `aPatchN`, the surface's mean normal; `aPatch` (its id 0..63,
  different from every surface it touches; the id it takes when it's drawn under 6 texels
  across: a surface under 7 cm, twice its area over its perimeter, merges with the
  biggest surface of its joint within 2 cm, so a gauntlet's finger faces, a fauld's hoops
  and a visor's breaths are one shape far off; its size; how flat it is, its normals
  summed by area over its area: 1 a flat plate, ~0.5 a dome, ~0 a ring round a limb);
  `aOcc`, how buried the corner
  is (the model voxelized at 1.5 cm, 12 rays over the corner's side out to 10 cm, a near
  hit counting more; only against its own joint, its parent, its children and their
  siblings, the helmets as the head, since it's measured in the rest pose). The key light
  is the fire light lifted 0.4 m to its flames' body: Lambert on the smooth normal,
  falling off steeply with distance (`(1.7 m / d)^1.5`, capped at 1.05: about 0.9 at a
  seat), times the floored light he's lit by, kept out of buried corners; the moon and
  the sky give a dim cool fill on the far side. Bands (`steel.js` `celRamp`, `CEL_TONES`):
  the flame's body over 0.72 (a plate squarely facing the fire), a light steel over 0.55,
  mid steel over 0.32 (or where the fill is strong), else shadow, and near-black where
  nothing reaches or the corner is buried; the highlight where a lit plate turns from the
  camera (a crescent on its fire-side curve) and a small glint; the raised edges the fire
  lights a band up. Chiaroscuro cuts only three bands (0.76, 0.38). **Curved plates**: a
  surface that isn't a ring round a limb (flatness over 0.2 to 0.35: a pauldron's dome,
  the great helm's crown, a lame) and at least 5 to 8 texels across takes a steeper light
  (`armor.js` `ROUND_GAIN` 2 about `ROUND_PIVOT` 0.85 of the key), 0.2 less where it
  mirrors the sky, and its far side steps down its own dark bands; the highlight at the
  heart of its lit crescent (`ROUND_HOT`). So a dome reads as curved metal, banded from a
  lit crescent to a dark far side, not a flat disc of the flame's body. The fire's
  reflection is tested on the surface's mean normal, so a plate facing the fire flashes
  as a whole into the lit bands (its heart to the highlight; a curved plate a band or two
  up, keeping its curve), and the sweeps glide over the plates facing the fire the same
  way; the far side never lights. Fog takes a far knight's bands a step down, toward the
  steel. **Dither** (round 10; the user: "i dont really see the dithering effect on him"):
  the pass dithers the scenery's continuous color, but his pixels arrive in exact tones
  and it leaves them alone (`if (!celHere)`), so the armor dithers his band edges itself,
  in the pass's own Bayer matrix (`dissolve.js` `wBayer4`/`wBayer8`, the pass's `bayer4`/
  `bayer8`: the color target is the pass's size, so `gl_FragCoord` is the pass's texel and
  his pattern lines up with the scene's). The pass's `ditherStrength` and `ditherScale`
  are shared with the armor by reference (`uDither`, `uDitherScale`, like the exposure),
  so the render menu's Dither and Pattern rows and Bonfire Live's slider move him with the
  scene. Near a band edge each texel's threshold moves the key (and the far side's fill
  and turn, and a curved plate's dark bands) across by up to half a window: the style's
  amount `a` (`uCelDither`) times the Dither over the site's 0.08, at most 2x (Live's
  slider goes to 0.4), takes `min(a, 1)` of the narrower band beside the edge (never more:
  no texel skips a band) and at most `a` x 4 texels (`DITHER_MAX`); none where that band is
  under 2 texels across on screen (`DITHER_MIN`, measured along the key's gradient; a thin
  limb's bands stay flat), fading in over a texel more. At Dither 0 there's no offset at
  all: exactly the flat bands. Not dithered: the highlight, the lips, the flame's flash
  and the sweeps, his own flash (`uLift`), the frost and the dissolve. The old checker seam
  (a band edge a texel early on alternate texels, only where the key changed under 0.03 a
  texel) is gone: it moved 0.2–2 texels a frame. Measured in pairs (the same frame drawn
  with round 9's shaders and the new ones; 3 bursts of 20 frames; home, Pixel Cel,
  Dither 0.08): at 1920 the dither moves 58–75 texels of his ~3,300 a frame and makes up
  7.5–9.6 % of the breastplate's, pauldrons' and cuisses' texels (patterned texels:
  moved, or beside one moved), single-texel speckle +0.6 to +1.1 points (round 9's
  method below; 9.4–9.5 % before), crawl at rest +0.05 points at most; at 1280 and 390,
  where his bands are narrower, ~20 texels a frame (+0.4 to +0.6 points). At 0.16 and 0.4
  the window widens on the wide bands only (speckle up to +1.35). Chiaroscuro's bands are
  twice as wide, so it takes 0.2 (at 0.4 it went +3 to +4.5 points at 2x). The
  painterly and chiaroscuro terminator isn't drawn beside a lone lit texel while the
  dither's on (a dot of a dithered edge: a terminator round each would scatter over the
  patch; at Dither 0 it's as before).
  **Line art** (`pixelPass.js` `celLine`): a line only where both surfaces are at
  least two texels thick across the edge and one of them more (`CEL_THICK`: no outline
  round a one-texel sliver, a corner poking through, a finger peeking from a gauntlet in
  his lap far off, nor between two thin strips such as a fauld's hoops, which show in
  their tones), and only as a stroke of five texels or more (`STROKE_MIN`, `longStroke`: a
  small flood along the stroke's 8-connected line texels, measured as it shows) or one
  that runs on to his outline (beside it something well behind him: his silhouette, not a
  gap in him onto the log right behind his lap), so a lap of gauntlets over thighs doesn't
  scribble (round 9's review: the strays by the gaps between his gauntlets and thighs at
  home 1920 are gone, and so are the 3–4-texel dashes of a fauld lame's or finger plate's
  edge on their own, with every stroke of five or more kept; what's left there are whole
  strokes, some crossing his near-black band, which shows them in part). **Finishes** in the pixel
  styles (`steel.js` `CEL_STEEL`): their darks and mids, most of him, in each finish's
  own steel, a clearly different plate at a glance: Gunmetal cool grey (the judges' look),
  Blackened near-black plate that lives by the fire it catches, Polished Steel a bright
  cool silver with more contrast, Burnished a warm bronze-brown; the lit bands are the
  flame's whatever the finish.
- **Material** (`armor.js`; its header has the details): Phong, flat shaded, every facet
  one exact color. **Gunmetal**: the scene's palette has no mid greys (only the blue-grey
  `stone` and `bone`), so his steel has a ramp of its own, a finish's five greys
  (`steel.js` `FINISHES`, dark to light, spaced so the ±0.04 dither never flips a facet
  that sits on a tone); his steel pixels, marked in the color buffer's alpha, snap to it
  in the pixel pass (`pixelPass.js` `setSteel`), never to the scenery's shadow, stone,
  wood or bone, while everything else snaps to the palette as before. Only with the
  scene's own palette: a few-color or debug palette, the x-ray and the breakdown's passes
  draw him as he is. The lit tones lean a little toward the fire's light (warm by an
  ember fire, cold by an azure one). **The light** (how it works: the fire is a point
  light): each facet takes it by its turn to the fire (Lambert) and its distance (falling
  off), mapped up the ramp, easing off at the top; the back gets only the cold sky and
  moon (a dim fill) and the void where nothing reaches; facets turned down and aside get
  a little of the fire off the ground. The strength he's lit by is the fire's light
  smoothed and floored (`FIRE_FLOOR` 0.8, rising in ~0.1 s, falling in ~0.6 s, capped a
  little over the resting glow), so a forge's dip only dims him and a stoke lights him at
  once, while a roaring Bonfire Live fire shows in his reflections, not by bleaching his
  plate. Metal is reflection: a broad Blinn-Phong sheen (a step or two up the ramp) and a
  faked environment, the mirror ray from his chest hitting the ground (warm near the fire:
  its `shade`) or the dark sky. Each facet sits flat on a tone; one the light puts right
  between two dithers between them over the last quarter of the step, so a big plate
  turning away shades off in a few pixels, never a hard line through it. Fog takes him
  smoothly down the ramp (no hard fog step). **The rim**: his silhouette's edge, a pixel
  inside the outline (the pass finds it from the depth edges), takes the flame's `lo` on
  the fire's side and its `shade` on the far side (*Edge Glow*, `setRim`, every step
  visible: 0 none; up to 0.3 one texel on the fire's side only, the flame's `lo` (the
  pixel styles: its dark, to 0.35); to 0.65, the default 0.5, the flame's `lo` (the pixel
  styles: its body) with the `shade` on the far side; to 0.85 two texels, the outer the flame's `mid` (its tips, even over
  the lit tones), the far side its `lo`; above, three, the outer its `hi`, two on the far
  side, and in the pixel styles the outline itself turns the flame's `lo` on the fire's
  side, the glowing contour of a sprite lit from there). **Finishes** (`setFinish`):
  Gunmetal (the default), Blackened (darker, duller), Polished Steel (brighter, a
  stronger mirror), Burnished (warm browned steel). **Texture: at the scale of the plates.** Three were
  built and judged side by side on the same frames (the site's home 1920 / 1280 / 390,
  projects and inspect; ember, azure, verdant, gilded and umbral; fire, lightning and ice;
  Bonfire Live's show on the demo track): A plain, B a fine object-space noise, C plate
  wear. B lost: at ~90 texels a 3 cm noise lands on single texels, reads as grime or
  stone, fights the ordered dither and adds single-texel speckle (steel texels unlike all
  four neighbours: 9.5 → 12.0 % at 1280, 10.1 → 12.3 % at 390) that crawls as he
  breathes. C won, modestly: each plate a touch lighter or darker than the next (a piece
  id per connected plate, `aPiece`, computed from the model in `knights.js`), the raised
  rims and ridges worn bright, the undersides where plates overlap a step darker; it
  separates the overlapping lames, hoops and bands without adding speckle (7.6 % against
  A's 8.2 % at home 1920) or crawl. So the idea was half right: a texture does help the
  light read, but only at the size of the plates; a fine one is noise at this resolution.
  The fire's reflection: each facet's mirror ray, seen from his chest so a facet flashes
  whole, is traced against a column of flame over the fire that sways, jitters with the
  flicker and swells with the light (`uTime`, `uFire`); the few facets whose mirror
  passes through it flash the flame's `hi`, near its base `core`, jumping from facet to
  facet at the fire's 12 fps as it flickers and he breathes. Other lights' highlights
  (fireflies, rings, lamps) flash the facets that mirror them; a beat (`uGlint`) widens
  the reflection. The old gold trim (`K_Trim`) draws as raised edge steel here (only the
  black-and-gold styles gild it).
  **Sweeps**: when the fire flares (a stoke 1, an impact 1, a weapon forming 0.8, a ring
  0.45–0.85, the cursor coming onto the fire 0.7; `armor.flare(strength)` from
  `scene.js`) its reflection sweeps across the whole armor: a band of facets, the leading
  edge in the flame's `core` and the rest in `hi`, rolls out from the facets that mirror
  the fire to those turned furthest from it in 0.6–0.95 s, fading as it goes. At rest a
  gentler band in `hi` runs over him every 4–8 s (out from the fire, up from below, or
  across), so the big planes (the pauldron domes, the helmet's face, the breastplate,
  the cuisses) take their turn. A facet is in the band by its mirror's angle from the
  sweep's axis (seen from his chest), so it flashes whole; the band steps at 12 fps.
  `uSweep` / `uSweepAxis`; `fire.knights.setShine({ rest, flares })` switches them;
  none under reduced motion.
  On the site `effects.knight.shine` switches both (the admin's).
  Mail gets an object-space ring pattern. The dissolve is the weapons' (`dissolve.js`);
  a dissolving knight or helmet is on the ghost layer (no outline or shadow of the holes).
  **Creases**: the pixel pass draws a crease line along each ridge; the scenery's are a
  step brighter, which on steel would come out a brownish line. The armor marks itself
  in the color buffer's alpha (the scenery's is 1): his steel 0.30 + 0.025 a tone on its
  ramp (-1 the void .. 4), 0.15 more on the fire's side (for the rim), 0.2 anything else
  of his; his creases step a tone down his own ramp (the darkest to the void; the flame in
  his plate and the rim keep their flat tone). The pixel styles mark 0.62 + 0.002 the
  smooth surface's id (or the id it merges into, small on screen), 0.14 more on the fire's
  side: their pixels snap to the style's eight tones (`CEL_TONES`) without the pass's
  dither (the armor dithers their band edges itself: **Dither** above) and get no facet
  creases; the pass draws their line art: a 1-texel line wherever
  two surfaces meet on screen or he meets what's behind him, on the nearer surface's pixel
  (the same depth: the higher id's), so every plate edge, crease and overlap gets exactly
  one, but not a lone texel of it (a line texel with no line beside it); the void, or over
  his lit tones the style's lit ink (his outline too); Painterly and Chiaroscuro add the
  terminator, the flame's dark shade on the one steel texel where a lit band meets the
  dark steel (only where the dark goes on past it, so a small part isn't speckled, and
  with the dither on not beside a lone lit texel, a dot of a dithered edge); their
  rim, just inside his outline over his steel, is the flame's body on the fire's side (its
  dark terminator shade under rim 0.35, two texels over 0.85) and its shade on the far
  side (over rim 0.3). The
  black-and-gold styles hand the pass no ramp: he snaps to the palette like the scenery,
  his creases a step darker in their own hue (round 8's).
- **The rest of the scene.** The living blade plans its moves clear of the knights
  (capsules, `bladeMotion.js`). Photo mode's nearest zoom is 2.1 m. Reduced motion: he
  sits still (no idle, reactions, gestures or dancing), and helmet swaps are instant.
  Touch devices get at most two knights. The breakdown's counts have a Knights row.
- **Cost.** His armor shader is the scene's biggest, so nothing may make it rebuild: the
  lights never change in number (the sceneries' lamps take a fixed pool of point lights,
  `MAX_LAMPS` in `scenery.js`, and the ruins' candle light goes dark elsewhere instead of
  being hidden), every light is on every layer (each pass sees the same lights), the
  fire's shadow is switched by its strength (`setShadows`: a uniform, and no redraws
  while it's off), and every shader is built before the first frame, in parallel where
  the browser can (`frame.compile`), with each mesh's normals and shadow shaders (the fire's
  shadow is a point light's: its distance shader for his skinned body is built then, not
  at his first summon). Measured on the site (Chrome, ANGLE D3D11): the load's longest task
  3.4 s → 0.3–0.5 s, the first scenery change 2.2 s → none over 100 ms, the first shadows
  toggle 2.1 s → none; round 9's review: no shader built at his first summon (19 programs
  before and after).
- **Loading.** His code (`knights.js`, `knightPose.js`, `knightArrival.js`,
  `summonSign.js`) is a chunk of its own (`knightBundle.js`, ~80 kB), fetched with
  `knight.glb`, not with the fire's. On the site, when he isn't there at load (the sign
  waits, or he isn't allowed), the fire's first frame doesn't wait for him: after it, his
  template is built in idle moments (`templateSteps`: each joint's plates and surfaces and
  the occlusion's pieces a step), then he and his sign are made, their shaders compiled
  (`frame.prepare`) and put in the scene, and the sign kindles as it appears (its settling
  glow). `fire.knights.ready` resolves then. With arrival `'start'`, in Bonfire Live and in
  the Painter he's built before the first frame as before. Measured on a production build
  (Chrome, ANGLE D3D11, 4× CPU slowdown): the site's first frame ~1.5–3.5 s → ~1.4 s, its
  longest load task 0.73–1.07 s → 0.42 s; the scene's chunk 727 kB → 239 kB (three.js
  now its own shared chunk).

### His arrival (the site; round 9)

He isn't there when the page loads: a knight sitting by the fire from the first frame was
too distracting. His **summon sign** glows on the ground in front of his seat instead, and
a click on it brings him; coming and going are the weapon swap's own dissolve, in the
current element's way. Bonfire Live is unchanged: its show casts its own knights.

- **Presence** (`src/bonfire/knightArrival.js`, wired up in `scene.js`): `away` (the sign
  lit) → `arriving` (~3.6 s) → `resting` (a rest rolled between `effects.knight.restMin`
  and `restMax`, 3–5 minutes by default, each time he comes) → `leaving` (~3.6 s, the same
  forge the other way) → `away`. His rest never runs out mid-action: while he's gesturing
  or dancing the site's dance, changing helmet or style, getting up or sitting down, or
  hovered, his leaving waits for it (`busy`; `BUSY_HOLD`, 15 s past his rest at most), and
  the visitor doing something with him (a gesture from the pack or a click on him, a new
  helmet) tops his rest up to a minute (`extendRest`). The pack's Knight item summons him
  (*Summon*) and sends him off sooner (*Send Him Off*; mid-swap, the forge takes him whole
  in the new helmet or style, held still as it took him). `effects.knight.show` allows
  him at all (off: he's gone at once, the sign with him); `effects.knight.arrival`
  `'start'` has him there from the first frame instead, and staying (round 8's way; in the
  admin's preview, turning Show off and on again with it brings him back).
  Each summon wears a new helmet at random (`effects.knight.helmet` `'random'`), unless
  the admin fixed one or the visitor picked one in the pack (it holds for the visit).
  The page follows presence through `onPresence`: the scene's description mentions him
  only while he's there, the discoveries that need him count only then (`main.js`
  `knightChanged`), and he greets a click only while he rests.
- **The sign** (`src/bonfire/summonSign.js`): the NH monogram, the header mark's own six
  strokes (`LOGO_STROKES`, parsed from `logo.js`'s path, so the mark and every glyph built
  from it never drift apart), as flat glowing bars 0.58 m tall, 3.2 cm strokes and wider
  the more they lie across the view (the cameras see the ground at about 17°, so the
  crossbar would otherwise read a third as thick), a darker halo round each bar. Its
  tones are the flame's (the bars its `hi`, the halo its `lo`) and follow it. Lit, it's on
  the solid layer (the edges of the stones it lies over don't outline through its
  letters); in the forge it moves to the ghost layer like a dissolving weapon. Alive but
  calm: every 5.5 s a band of the flame's `core` rolls up the letters (stepped at 12 fps),
  and a few faint motes drift up off the strokes. **Hovered** (`hoverAt` returns
  `'sign'`, the cursor a pointer): the bars go `core`, the halo `mid`, and every mote
  rises, faster; no label. A click on it summons him (`main.js`; the stage's click tests
  `fire.signAt(x, y)` first). Reduced motion: no breath or motes (the hover still lights).
- **Coming and going** (`src/bonfire/forgeRun.js`): the weapon swap's dissolve, swirl,
  gather and form, pulled out of `weapons.js` into a runner that works on any two
  *subjects* (samples on its surface, their heights, a span, a silhouette, its dissolve's
  uniforms), so the swap and his arrival are the same effect. The weapons are subjects;
  so are the sign (its samples on the strokes, a column over it for the helix, its
  silhouette lying flat) and he (`knights.forgeSubject(i, n)`: his posed body and helmet
  skinned on the CPU, sampled by area, each sample's height his rest height over his
  body's span (the armor dissolve's own), a helix 0.42–0.58 m round him, his silhouette
  from the posed triangles). Arriving, the sign is the old weapon and he's the new one;
  leaving, the other way round. By element, as the swap:
  - *Fire*: the sign burns away in a ripple of ember edges; its embers rise, wind round
    his seat in a double helix and build him from his boots up behind a burning edge.
  - *Lightning*: a bolt out of the sky strikes the sign, which strobes and crackles apart
    (an arc crawling along its edge); arcs leap between the charging cloud and the ground;
    he forms in five jumps, each a flash and an arc; a bolt strikes his helm.
  - *Ice*: frost creeps over the sign until it shatters; a slow hexagonal helix gathers
    the shards; he grows from his boots up inside a cocoon of crystals that cracks off.
  He forms in his own steel behind the burning edge (the forge's glow wash, which makes a
  blade glow, would turn a whole knight into a flat cut-out: `formGlow: false`); each of
  the lightning's jumps flashes him up his own ramp instead (the armor's `uLift`, as a new
  helmet does: `JUMP_LIFT`, fading in ~0.1 s), never a frame of flat crimson or brown;
  formed, a light hit, the fire's reflection sweeps his
  armor (`armor.flare(0.8)`) and the fire bursts a little. Leaving, he burns away from the
  boots up (ice: the frost glaze, the armor's `uFrost`, creeps up him and he shatters),
  his embers wind down onto the sign, which forms again, flashes and relights. The edge
  colors are the weapon's (fire and lightning the flame's `mid`/`hi`, ice `hi`/`core`);
  the strikes' flashes are the swap's, lighter (0.7). His own particle pool, helix lines
  and arcs (the weapon's may be busy forging), named "Summoning (the knight)" for the
  breakdown's counts. Reduced motion: he appears and goes at once. A new scenery while
  he's coming or going finishes it at once (he's there at the new seat, or gone and the
  sign lit there); resting, he goes to the new seat as before (the quick ember fade stays
  for scenery changes and Bonfire Live's walks). `summon(i, { forge: true })` seats him
  burnt away on the ghost layer and leaves his dissolve to the forge; `forged(i)` ends it.

### `fire.knights`

Safe before the model loads and without it (then there are no knights and nothing
happens). Knight 0 is the one at the seat; the visualizer's extra knights (up to 4, 2 on
touch devices) have no seat and sit on the ground at home (see *The others* above).

| Member | What it does |
| --- | --- |
| `ready` | resolves `true` once there are knights (`false` without the model); on the site, when he's away at load, a moment after the first frame (see *Loading*) |
| `count`, `present`, `max` | knights in the cast (up to the highest one here and staying: it drops as knights are sent away), how many are showing, the most allowed |
| `list` | `[{ index, present, state, position, facing, helmet, move }]`; `state` is `sitting`, `standing`, `dancing`, the act he's in (`rise`, `lower`, `walk`, `turn`, `place`: settling onto his seat, a frame), `arriving`, `leaving` (burning away for good), `ember` (going somewhere by ember: still in the cast) or `away` |
| `positions` | each present knight's head (world `Vector3`s), for cameras |
| `helmet`, `setHelmet(name, { index, instant })` | `'great'`, `'armet'`, `'bascinet'`: hands to the helm, the old one burns away in ember edges, the new one forms, a flash and a puff of sparks (1.6 s); resolves when done. The setter swaps every knight's |
| `setCast({ count, helmets, instant })` | how many knights are there (the rest are summoned or dismissed); `helmets` a name, a list (per knight) or `'random'` |
| `summon(i, { instant })`, `dismiss(i, { instant })` | forming out of embers feet first (0.55 s) at his seat or home (or standing `at` a place); burning away. With `forge: true`: handed to the forge instead (`forgeSubject`, `forged`) |
| `presence`, `onPresence(fn)` | the site's knight: `'away'` (his sign waits), `'arriving'`, `'resting'`, `'leaving'`; `onPresence` calls `fn(presence)` on each change and returns an unsubscribe. Bonfire Live: `'resting'` while knight 0 is there, else `'away'` |
| `summonKnight({ instant })`, `dismissKnight({ instant })` | the site's knight: summon him from his sign (in a new helmet, through the forge in the current element's way; `instant` at once) / send him off into it; `false` if he can't come or go now |
| `restLeft` | seconds of his rest left (`Infinity` when it doesn't run out: arrival `'start'`, or he isn't resting); settable, for tests. A gesture or a new helmet for knight 0 tops it up to a minute |
| `forgeSubject(i, n)`, `forged(i)` | knight i as the forge sees him (his posed body: `n` samples, heights, span, silhouette, his dissolve's uniforms); the forge is done with him (whole, or gone) |
| `sit(i)`, `stand(i)` | back to his seat (walking there, round the fire if need be; by ember only if it's far or blocked), or up on his feet |
| `dance(i, { move, energy, slot, position, facing, offset, seed, seated })` | stands, goes to the slot (1–5, see `slots`) or position, turns (`'front'`, `'fire'`, `'out'` or a yaw) and dances on the clock. Called again while dancing it changes `move` (a quick crossfade), `energy` or `offset` in place; with `seated` he dances sitting (upper body moves only). `offset` (beats) puts dancers in canon. Already up, there and turned, he starts dancing at once |
| `react(kind, strength, { at, radius })` | `'impact'` (a flinch, `strength` 0..1), `'stoke'` (he leans away), `'ring'` (he lifts his feet as its front passes); not the flinch or the lean for a knight dancing on his feet or cheering; with `at` (`{ x, z }`: the living blade swinging close) only knights within `radius` (1.1 m) react, and a dancer flinches too, at 0.6 of the strength; the site's knight only when `effects.knight.reactions` is on |
| `setReactions(on)`, `reactions` | Bonfire Live: whether its knights react at all (`react()` and the fire's own stokes, impacts and rings) and sit up to watch a weapon in flight; `reactions` reads it back (on the site, `effects.knight.reactions`) |
| `setShine({ rest, flares })`, `shine` | the fire's reflection sweeping the armor: now and then at rest, and when the fire flares (both on by default); `shine` reads them back. The site's knight follows `effects.knight.shine` |
| `setStyle(name or null, { instant })`, `style` | the Knight Style (`knightStyles.js` `STYLE_KEYS`; null: the settings' `effects.knight.style`): knights who are here burn away and form again in it (~1.2 s; `instant` at once if its model is ready, else the burn when it is); resolves true once it shows (a style with its own model fetches it first) |
| `prepareStyle(name)` | get a style's model ready beforehand (fetched, its template built in idle moments); resolves true once it is |
| `setFinish(name or null)`, `finish` | the steel's color (`steel.js` `FINISHES`: `gunmetal`, `blackened`, `polished`, `burnished`) for the styles that draw steel; one for the whole cast (the pass has one steel ramp a frame); null: the settings' `effects.knight.finish` |
| `setRim(v or null)`, `rim` | the edge glow, 0..1: how strongly his silhouette's edge takes the fire's color; null: `effects.knight.rim` |
| `setSeatPose(name, { index })`, `seatPose` | how they sit: `'resting'` or `'watchful'` (`SEAT_POSES`); `index` for one knight. The site's follows `effects.knight.seat` |
| `clock(beatPos, period)` | the beat, every frame: `beatPos` in beats, `period` s a beat. Moves are pure functions of it, so they stay on the beat through hit-stops and tempo jumps. Without it he dances on at the last tempo |
| `gesture(name, { index })` | `praise`, `wave`, `bow`, `point`, `beckon`, `shrug`, `hurrah`, `joy` (1.6–2.3 s), over whatever he's doing, and `dance` (~7.3 s: seated, he stands, turns to the front, dances the Default Dance for two bars at 118 BPM on his own clock and sits back down; on the site's tall view, ~4.8 s in his seat: the Default Dance's arm swings and head bob leaning in over his knees, his helmet under the page's header all through); `index: 'all'` for everyone. `true` only if someone started it (a knight changing helmets has his hands full) |
| `lookAt(point or null, { index })` | he turns chest, neck and head toward a world point (e.g. the cursor), or stops |
| `slots(scenery?)` | `{ center, radius, free, slots }`: the dance ring (1.2 m round the fire), its clear arcs in degrees (0° toward the camera, 90° to +x; the arc 258°→360°→96° is clear everywhere) and the slots `[{ x, z, bearing }]`: 1 (270°), 2 (310°), 3 (50°), 4 (88°), 5 (168°, not in the cult). Dancing with no place given, 1 knight takes slot 1; 2 take 1 and 4; 3 take 1–3; 4 take 1–4 |
| `moving` | a pose stepped this frame with real motion, or he formed, burnt away or was put somewhere new (the shadow's redrawn) |

The moves (`MOVES` in `knightPose.js`, each with its cycle in beats; the seated ones work
sitting down too): `nod` (2, seated: drumming on the thighs), `stepTouch` (2),
`fistPump` (8, seated), `headbang` (2, seated; air guitar for some seeds), `swayArms`
(2, seated), `march` (2), `spin` (4: a full turn a bar), `jump` (2: every beat, every other
when it's fast), `jumpingJack` (2), `clap` (2, seated), `stomp` (2), `praise` (a
held Praise the Sun for drops, seated) and `defaultDance` (8, seated: round 9's, after the
emote: bouncing arm swings across the chest, then alternating heel kicks with the arms
thrown down and out; seated, the arm swings alone). `energy` 0..1 scales them from big
to bigger; `seed` mirrors some and picks variations.

## In Bonfire Live

- **Presence** is rolled only where a change is hidden: at the start, at big drops (in
  the blackout and the flash) and at scenery changes. Off / In the mix / Always.
- **Dancing** follows the music: seated nods in the intro and breakdowns, rising in the
  build, leaping up on the drop, big moves for the first bars after a drop, groove moves
  while the energy holds, sitting again on a phrase boundary when it falls. Off (they
  sit) / In the mix (those moments) / Always (whenever the groove is locked).
- **Where.** Dancers use slots on a ring about 1.2 m round the fire, only on the arcs
  that are clear in the current scenery; formations: round the fire (along the clear
  arc, turning back each phrase), in a line, solo, and in canon.
- **Moves** are functions of the beat phase (so hit-stop and tempo changes can't knock
  them off the beat): nods, step-touches, fist pumps, headbangs, swaying, marching,
  spins, jumps, claps, the Default Dance among the groove's, and the Dark Souls gestures
  on the big moments (Praise the Sun on the drop).
- **Options** (the Knights tab, `knightShow.js`): *Style* (the site's own, a style, or in
  the mix), *Finish* (in the mix leaning to gunmetal), *Edge Glow* and *Seat Pose*; one
  for the whole cast, rolled only at the hidden moments, at once when changed by hand;
  the helmets stay drawn per knight. The pack sets the style, finish and helmets too.
- **Preset scenes** (the Painter's; [painter.md](painter.md)) set their own knights: how
  many (0–4), each one's helmet (or drawn), the style, finish, edge glow (off, in the mix
  or always, and its strength), seat pose, dance, formation, moves, shine and reactions.
  The four built-in scenes use them (their edge glow always, at their own strength):
  *Cathedral Kaleidoscope* (two dancing in Pixel Painterly), *Frozen Shrine* (one
  watchful in Pixel Cel), *Forge Rave* (four in Pixel Chiaroscuro), *Moonlit Ruins*
  (one resting in Black & Gold).
