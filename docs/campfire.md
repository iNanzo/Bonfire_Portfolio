# The Campfire Game: running a night

A barebones game night on the bonfire at `/larp/`: rounds with a timer, team scores, and
modifiers that bring up the site's own banner and make the fire answer. It's built like
Bonfire Live: **one screen**, the bonfire full screen with the scores and the timer over it,
and the host's controls as an overlay along the bottom that fades when the mouse rests. The
projector gets the same picture without the controls through the **Output** window. It runs on
one laptop; nothing needs the network once the page has loaded.

## Before the Night

Open `/larp/` (`npm run dev`, then <http://localhost:5173/larp/>, or the deployed site). A new
game opens **Setup** (S) by itself:

1. **Teams:** a name and a color each. The color marks the team on the scoreboard, its
   multiplier chip and its banners. No members: points go to teams.
2. **Rounds:** a name, how long (the timer), and a **Scene**: one of the site's preset scenes,
   one of yours from the Bonfire Painter (My Scenes, in this browser), or the site's own fire.
   Each round plays its own scene: its place, colors, framing, look and knights.
3. **Modifiers:** what you give during the night. Each has a **Title** and **Subtitle** (the
   banner's two lines), **Points** (negative takes points away), a **Multiplier** (the team's
   points count that many times over for the rest of the round), **Fire** (what the bonfire
   does when the banner comes up; Random rolls a new reaction each time) and **Special** (calls
   the knights to the fire). The first nine are on keys 1–9.
4. **Game:** the title, how long a banner holds, how many knights a Special banner calls,
   and reduced motion. **Export the Game** saves it to a file; **Import a Game** loads one.

Everything is saved in the browser as you go: a reload or a closed tab picks up where it was.

## On the Night

1. Plug in the projector and click **Output** (O). Drag the new window to the projector and
   double-click it for full screen. It shows the fire, the scores, the timer and the banners,
   never the controls.
2. **The timer:** Space starts and pauses it, + adds a minute, R resets it. It turns to the
   fire's color in the last ten seconds and blinks at zero; nothing moves on by itself.
3. **Giving points:** click a modifier (or press its number), then the team (or its number).
   Its banner comes up on both screens: the title, the subtitle, and what was given
   ("+50 · Red Team", "×2 · Blue Team"), and the fire answers it. Banners given quickly wait
   their turn. For points by hand, click a team on the scoreboard and pick an amount.
4. **The knights:** a Special modifier calls them to the fire with its banner. While they're
   there, every banner has them cheer (or shrug at a loss). K sends them away; the next
   round's scene decides who's there again.
5. **Rounds:** ← and → go to the previous or next round: its scene plays and its timer is set.
   Multipliers end with their round.
6. **Undo** (Z) takes the last points back. **Clear the Scores** (Setup, Game) starts the night
   again with the same teams, rounds and modifiers.

? lists every key. H hides the controls; F is full screen on the laptop.

## Good to Know

- The first version of the game (the bilingual event with rosters and reveals) saved under
  `larp.event`: the first time this version opens, it carries over that event's teams, colors,
  rounds and points, and leaves the old save as it was.
- A save it can't read is kept aside (`larp.game.unreadable`) and a new game starts; nothing is
  written over it.
- Without WebGL the fire doesn't show, but the scores, timer and banners still work.

The code: `src/larp/` (`main.js` maps it). Tests: `test/larp*.test.mjs` and `e2e/larp.spec.mjs`.
