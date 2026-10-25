# Lửa Trại Nghĩa Sĩ: running the campfire game

A companion for a 50-minute TNTT Nghĩa Sĩ activity at `/larp/`: teams perform five short
challenges, the Huynh Trưởng award named points, and a projector shows the rounds, the award
banners and the standings around the bonfire. It runs on **one laptop with no network**: the
host console in one window, the projector display in another. Youth don't need phones.

The design and its reasons are in [design/nghia-si-campfire.md](design/nghia-si-campfire.md).

## Before the Day

Open `/larp/` (`npm run dev`, then <http://localhost:5173/larp/>, or the deployed site) and
fill in **Setup** and **Teams & Roster**:

1. **Teams:** a name (Vietnamese and an optional English line), a color and an emblem. Any
   number of teams. The preview says when a name is shown in Inter instead of the display
   font (Cinzel has no Vietnamese tone marks).
2. **Roster:** paste the youth's names, one per line, into each team; mark a captain if you
   like. Display names only.
3. **Co-GMs:** the other HTs' names. No accounts.
4. **Rounds:** each round's prompt, base points and times. The estimate updates as you go
   and says how far over 50 minutes it runs (each team past four adds about 6 minutes).
5. **Display:** language (Bilingual, English First, Vietnamese Only), scenery, reduced motion,
   sound, and an optional **Host PIN** for leaving Judge Mode.
6. **Print Award Cards** if co-GMs will hand awards in on paper.

Everything is saved in the laptop's browser as you go. **Export Backup** saves the event to a
file (keep one); **Import Backup** loads it on another laptop.

## On the Day

1. Connect the projector and set the laptop's display to **Extend** (not Mirror).
2. Open `/larp/` **while online**, choose **Open Display Window**, drag it to the projector
   and choose Full Screen. Follow the **Projector Checklist**; **Show Test Pattern** puts a
   title, a banner and a timer up to check from the back of the room.
3. Check **Ready For Offline** in Setup. From then on the game needs no network, but **keep
   both windows open**: reopening a closed window needs the network (the console warns you).
4. Choose the big button at the top. It always names the next step: Start Event, Start Round,
   Start Preparation, Next Team, Review Round, Publish And Reveal, Start Next Round.

### During a Round

- **Timer:** Pause, Add 30 Seconds (for the whole round, not one team), End Preparation,
  Next Team. At zero it only prompts; nothing is cut off or published.
- **Completion:** mark each team Complete, Passed or Absent. Publishing waits until every
  team has one.
- **Awards:** in the Run tab, pick the team (it defaults to the team performing) or switch to
  individuals, type a name, the points (`−` / `+`, or type `-25`), and press Add or Enter.
  **From** says which HT gave it. Recent awards and templates fill the form in one click.
- **Co-GMs** either hand their awards to you (enter them with their name under From), or step
  up during a changeover, press **Judge Mode** (`J`), pick their name, add their awards and
  press **Done**. Judge Mode can't touch timers, phases or publishing, and locks once you
  start Review.
- **Review Round** shows the teams side by side with flags: repeated award names, unusually
  large values, teams with no individual awards yet. **Publish And Reveal** freezes the round
  and starts the banners on the projector. Pause, step, skip or replay them; scores never
  change. A mistake after publishing is fixed with **Add Correction** in History.

### Keys

`Space` pause or resume the timer · `N` next team · `T` add 30 seconds · `A` the award form ·
`J` Judge Mode · `?` the list. Nothing publishes from a single key.

### If Something Goes Wrong

| What happened | What to do |
| --- | --- |
| The console tab closed or the laptop restarted | Reopen `/larp/` and choose **Resume Event**: same round, scores and timer |
| The display window closed | **Open Display Window** again (needs the network unless the page is cached); it resumes where the room was, mid-reveal included |
| The browser won't save (private window, full storage) | A warning says so; play continues. **Export Backup** right away |
| A second console tab opened | It's locked; **Take Over** moves control to it |
| The projector shows the console | The display is mirrored: switch the laptop to Extend |
| No 3D (WebGL off) | The display uses a still of the bonfire; everything else works |

## After the Event

The Run tab shows the final standings and the full individual ranking. **Export Results**
saves a CSV of teams, names, scores and award reasons (no private notes). **Delete Event
Data** removes the event from the laptop; nothing leaves it unless you export it.

## For Developers

- Code: `src/larp/`. The rules, scoring, phases, roles and saving are pure modules
  (`types.js` lists who owns what); `state.js` reduces commands over them. The screens are
  pure render functions (`host*.js`, `judge.js`, `display.js`) with thin DOM layers
  (`hostDom.js`, `displayDom.js`); `channel.js` links the two windows; `stage.js` turns game
  events into scene cues.
- Tests: `test/larp*.test.mjs` (unit) and `e2e/larp.spec.mjs` (a whole event offline with the
  display, reloads and a backup): `npm run e2e -- larp`.
- The saved event is versioned (`store.js` `MIGRATIONS`): a change to its shape needs a
  migration and a test that loads the old shape.
- Game code never reaches the portfolio's first load (`firstLoadGuard` in `vite.config.js`,
  and `test/site.test.mjs`); `/larp/` is `noindex` and kept out of the sitemap.
