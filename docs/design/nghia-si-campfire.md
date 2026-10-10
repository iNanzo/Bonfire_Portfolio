# Lửa Trại Nghĩa Sĩ (Nghĩa Sĩ Campfire): design notes

Status: **design only, nothing implemented** (revised 2026-10-10).
Source: Newton's request for a browser companion to a 50-minute, in-person TNTT Nghĩa Sĩ
activity, built on the Bonfire Portfolio's scene, look and UI pieces. Revisions, in order:

1. The first handoff, refined: each portfolio reference checked against the code, plus UI/UX
   for every screen.
2. **One laptop, no network.** The owner chose to run the whole game on the host's laptop: the
   host console in one window, the projector display in a second. Youth don't join on phones;
   the host enters the teams and roster. Co-GMs either hand their awards to the host to enter,
   or take turns at the laptop in **Judge Mode**. No server, no player or co-GM phones, so
   nothing to deploy beyond GitHub Pages.

Teams perform five short challenges while Huynh Trưởng (HTs) award named points. The
projector runs the rounds, reveals the awards as banners and shows the standings around the
portfolio's pixel-art bonfire. **The people in the room are the game.** The laptop handles
pacing, judging and the celebration; youth spend the activity preparing, performing and
watching each other, with no phones needed.

## Contents

1. [Product Decisions](#product-decisions)
2. [Built on the Bonfire Portfolio](#built-on-the-bonfire-portfolio)
3. [Nghĩa Sĩ Identity and Youth Experience](#nghĩa-sĩ-identity-and-youth-experience)
4. [The Game](#the-game): the explanation, the five rounds, the 50-minute run
5. [Setup and Roles](#setup-and-roles)
6. [Scoring](#scoring)
7. [Judging, Review and Publication](#judging-review-and-publication)
8. [Banner Reveal](#banner-reveal)
9. [UI/UX](#uiux): principles, visual language, the scene's cues, each screen, accessibility
10. [Vietnamese and English Wording](#vietnamese-and-english-wording)
11. [Architecture](#architecture): files, the two windows, saving and recovery, records
12. [Acceptance Criteria](#acceptance-criteria)
13. [Estimate](#estimate)
14. [Implementation Sequence](#implementation-sequence)
15. [Prompt to Use with Claude Code](#prompt-to-use-with-claude-code)

## Product Decisions

### Confirmed Requirements

| # | Requirement |
| --- | --- |
| R1 | The audience is **Nghĩa Sĩ**. |
| R2 | The activity lasts **50 minutes**. |
| R3 | **Any number of teams**: no hard-coded team limit. |
| R4 | **Five rounds**, one subject for everyone per round: fun fact, dance, prayer or song, Bible scene, team cheer. |
| R5 | The host enters the teams and the roster (revised: originally players joined with a lobby code). |
| R6 | Team **and** individual standings both matter. |
| R7 | The host adds co-GMs (the other HTs) by name. Co-GMs judge by handing awards to the host, or in Judge Mode at the laptop (revised: originally the host granted GM access to joined participants). |
| R8 | GMs name modifiers and choose their values themselves, **negative ones included**, for teams or individuals. |
| R9 | Modifiers appear as banners at the end of the round: who gets them and how many points they add or subtract. |
| R10 | Reuse the Bonfire Portfolio's engine, assets and visual language. |
| R11 | Vietnamese terminology with English translations. |
| R12 | The whole game runs on **one laptop with no network** once the page has loaded (new). |

### Recommended Defaults

Implementation defaults proposed here, not additional requirements. Settings marked
editable stay editable.

| Decision | Default |
| --- | --- |
| Event size | No team limit; the sample timetable uses four teams |
| Team size | Host-configured; roughly equal sizes recommended |
| Staffing | One host and one or two assisting HTs (co-GMs) |
| Hardware | One laptop connected to a projector or large screen, the display set to **Extend** (not Mirror) |
| Phones | Not used by the game |
| Scoring | Completion points plus custom signed point adjustments |
| Publication | The host reviews and publishes one whole round at a time |
| Language | Vietnamese titles with English subtitles; English-first and Vietnamese-only modes |
| Working title | Lửa Trại Nghĩa Sĩ · Nghĩa Sĩ Campfire |
| Route | A separate `/larp/` page in this repository, like `/visualizer/` and `/painter/` |
| Hosting | GitHub Pages, with the rest of the site; nothing else to deploy |
| Accent | The **Gilded Flame** (yellow, a nod to Nghĩa Sĩ) over the site's charcoal and bone |

The original working title, **Larp Simulator: Holy Knights**, can stay a subtitle or
nickname. It does not identify the participants as Ngành Hiệp Sĩ. Final branding (and the
route's name) is the owner's choice.

### Out of Scope

- **Not in this release, possible later:** co-GM phones over a peer-to-peer link (an optional
  add-on that would never be required for the game to run), and a hosted multiplayer server.
- **Dropped:** player phones and joining (lobby codes, QR codes, team capacities, team
  switching), host transfer between devices, action cards, wildcards, random double-point
  rounds, audience voting, automatic microphone scores, automatic last-place bonuses,
  percentage or multiplier modifiers, an opening call-and-response, custom 3D models and
  accounts.

## Built on the Bonfire Portfolio

The game is a fourth app beside the site, Bonfire Live and the Painter: same Vite build,
plain JavaScript with JSDoc, same three.js scene, same tokens and UI pieces. It reuses
rather than rewrites. Everything in this section was checked against the code on
2026-10-10; signatures can drift, so confirm them again before using them.

### What It Reuses

| Portfolio piece | What the game takes from it |
| --- | --- |
| `src/bonfire/scene.js` `createBonfire(container, { reducedMotion, effects, onError, … })` | The display's scene, built once and disposed on leaving. Its API has `stoke`, `pulse`, `sparkle`, `ring`, `flash`, `setScenery`, `setPalette`, `setMaxFps`, `knights`, `ready` and `dispose` |
| `src/sceneries.js` (`ruins`, `forge`, `shrine`, `cathedral`, `cult`) | The places. The default is **Gothic Ruins** (`ruins`, the scene's own starting place). Offer `ruins`, `shrine` and `cathedral`; never `cult`, and leave `forge` out unless reviewed. There is no separate "campfire" scenery: the bonfire in the clearing *is* the campfire |
| `src/palette.js` flames (`ember`, `gilded`, `spirit`, `azure`, …) | Flame colors per round mood. Flames are admin-editable data, so look them up with `flameOr(key)` and fall back gracefully |
| `src/ui/theme.js` | The page's accent variables follow the flame; `--accent-hi` is the text color and is kept at 4.5:1 or better on the void |
| `src/bonfire/knightGestures.js` `GESTURES` (`praise`, `wave`, `bow`, `point`, `beckon`, `shrug`, `hurrah`, `joy`, `dance`) and `knights.js` | The knight as a mascot: a wave at the start, `hurrah`/`joy` for a reveal, dancers for the cheer round. Bonfire Live already shows several knights dancing round the fire |
| `src/visualizer/output.js` | The closest precedent: Bonfire Live's controls stay in one window while a second window goes full screen on the projector. The game's display window is its own page fed by the host window (see [The Two Windows](#the-two-windows)) rather than a streamed canvas |
| `src/visualizer/cards.js` | The pattern for round cards and award banners: an HTML card drawn **over** the canvas, timed, never part of the 3D frame |
| `src/tokens.css` | Colors (`--c-void`, `--c-shadow`, `--c-stone`, `--c-wood`, `--c-bone`, the accent ramp) and the three typefaces. See the font caveat below |
| `src/styles.css` `.panel` (`--panel-bg`, `--line`), `src/ui/dither.js` | The framed panel and its dithered entrance, for the display's phase changes |
| `src/ui/shell.js` (`q`, `qa`, `typing`, `toggleFullscreen`) | Page basics; `typing()` keeps the host's shortcuts quiet while they type an award name |
| `src/ui/spatial.js`, `restMenu.js`, `keysOverlay.js`, `focus.js` | Arrow-key navigation, the menu dialog, the `?` shortcut list, focus handling |
| `src/ui/tooltip.js`, `describedTip.js`, `fields.js` | Hints with a "?" that also reach screen readers; settings markup for Setup |
| `src/ui/audio.js` | Synthesized sound, muted until switched on: the model for the reveal's optional sound |
| `src/text.js` `titleCase()` | English labels only. Vietnamese strings are written out in full, never title-cased by code |
| `src/html.js` `esc()` | Escaping any text placed in markup (names and award reasons are plain text) |
| `src/scenes.js` `MIGRATIONS` | The precedent for versioned saved data that never breaks (the saved game follows it) |
| `vite.config.js` | A fourth `input` entry; `firstLoadGuard` keeps game code out of the portfolio's first load |

### Verified Caveat: The Display Fonts Have No Vietnamese Subset

The `@fontsource` packages the site ships (`cinzel@5.3.0`, `pixelify-sans@5.3.0`) carry only
`latin` and `latin-ext` (plus `cyrillic` for Pixelify Sans). Vietnamese tone-mark letters
(the Latin Extended Additional block, such as **ử, ạ, ệ, ở, ộ**) are not in either.
**Inter** has a Vietnamese subset. Without care, "Lửa Trại" in Cinzel draws "ử" in a
fallback font mid-word.

So:

- Vietnamese text is set in **Inter** (500 or 600 for titles).
- Cinzel (names and English titles) and Pixelify Sans (short labels, numbers on banners) are
  used only for strings every character of which they cover. A small helper decides per
  string, and the whole string falls back to Inter, never single letters.
- Team names are the main risk: even the word **Đội** (ộ, U+1ED9) is outside Cinzel, so a
  name like "Đội Phaolô" always falls back. Show the Vietnamese team name in Inter and use
  Cinzel for the English line ("Team Paul") or a bare patron name ("Phaolô" fits). Setup
  previews each name in its display font and says when it falls back.
- Adding a Vietnamese-capable display face is a later option, not an MVP task.

### What Is New

A `larp/index.html` entry and a `src/larp/` folder: game rules and state (no DOM, no three.js),
saving and restoring, the link between the host and display windows, the two screens, and a
presentation adapter that turns game events into scene cues. Nothing in `src/bonfire/`, the
site, Bonfire Live, the Painter or the admin changes behavior. See [Architecture](#architecture).

## Nghĩa Sĩ Identity and Youth Experience

VEYM's bylaws place Nghĩa Sĩ at ages 13–15 and translate the branch as **Companion**. Use
the local group's actual roster; never record ages.
[VEYM bylaws, Article 20 and glossary](https://old.veym.net/resources/files/NoiQuy2019.pdf)

- **Tone:** adventurous and socially comfortable for young teens. A clear challenge, and the
  team decides how to deliver it. No babyish rewards, no forced solo performances, no humor
  aimed at embarrassing anyone.
- **Recognition:** HTs reward what they can observe: explaining clearly, inviting a quieter
  teammate into a role, helping another team, recovering together after a mistake.
- **Roles for everyone:** actors, narrators, fact finders, rhythm keepers, organizers.
  Seated movement, notes and supporting roles all count as taking part.
- **No devices needed:** nobody needs a phone, so no one is left out for not having one.
- **Faith, handled with care:** Catholic identity lives in the content, the teamwork and the
  tone. The score is **Điểm / Points**; positive awards are **Điểm Thưởng / Bonus Points**.
  The game never measures holiness, prayer quality or anyone's faith. Grace, blessings,
  Communion and **Bó Hoa Thiêng** are never game mechanics: Bó Hoa Thiêng already means a
  spiritual bouquet of prayer and sacrifice.
  [VEYM spiritual bouquet campaign](https://veym.net/news/posts/celebrating-the-veym-national-day-of-prayer-with-the-2023-spiritual-bouquet-campaign-for-rosary-month-and-the-holy-ween-costume-contest)
- **Not official:** this is a campfire-themed youth activity, not an official TNTT campfire
  ceremony. Being a co-GM in the app is not a TNTT leadership role.
- **The knight** is the portfolio's mascot, not a symbol of a TNTT branch.

## The Game

### Explained to the Room

The host reads this (or a version of it) at the start, with the display showing the teams.

> You're in teams. Each round everyone gets the same kind of challenge: share a fact, dance,
> pray or sing, act out a Bible story, then finish with your team cheer.
>
> You get a few minutes to prepare together. Decide who does what, then take your turn. The
> HTs can give your team, or individual people, bonus points for things they notice. Every
> bonus has a name, so you know what it was for.
>
> HTs can also take points away for rules explained before the round. Those have a name and
> an amount too, so you can see what changed.
>
> At the end of each round, watch the screen reveal the awards and the new scores. The team
> with the most points wins, and we celebrate individual contributions too.

The loop: **hear the challenge → prepare together → perform and watch → HTs review →
reveal → standings → next round**.

The players' decisions are about teamwork and expression: who takes which role, which idea,
how to land it within the time. There is no hidden economy and no optimal strategy.

### The Five Rounds

Every team gets the same time and the same judging guidance. The host sets the prompt
before preparation starts; the prompts below are examples to adapt.

| # | Vietnamese | English | Challenge | Completion | Turn |
| --- | --- | --- | --- | --- | --- |
| 1 | Khám Phá Đức Tin | Faith Discovery | Share one accurate Bible, saint or Catholic fact and why it is interesting. | 100 | 45 s |
| 2 | Vũ Điệu | Dance | A short group movement routine; seated gestures and rhythm roles count. | 200 | 60 s |
| 3 | Cầu Nguyện / Thánh Ca | Prayer / Sacred Song | A short prepared prayer, or a suitable song sung together. | 300 | 60 s |
| 4 | Hoạt Cảnh Kinh Thánh | Bible Skit | A Bible scene with a clear beginning, key moment and takeaway. | 500 | 90 s |
| 5 | Băng Reo Đội | Team Cheer | The team's name, a shared value and a response everyone can join. | 300 | 30 s |

Wording notes: **Lời Chứng / Testimony** is not a fun fact. **Thánh Ca / Sacred Song** alone
leaves out the prayer option. **Khẩu Hiệu Đội / Team Motto** can be part of the cheer;
**Băng Reo Đội** names the performed cheer.

Suggested prompts:

- **Faith Discovery:** "Tell us one thing about your team's patron saint and one way we can
  follow that example this week." Notes or a reference card are allowed.
- **Dance:** "Create four repeatable movements that tell a story about working together."
- **Prayer / Sacred Song:** "Prepare a prayer of gratitude or a verse about trust in God."
  A quiet prayer earns the same completion points as a loud group song.
- **Bible Skit:** "Show a moment from the Good Samaritan and end with one sentence about being
  a neighbor." Teams interpret the same prompt, or choose from equally brief HT-prepared
  options. Show a short passage summary so recall is not the barrier.
- **Team Cheer:** "Include your team name, one value you want to live, and a response
  everyone can join."

Encourage a different lead voice each round. Captains coordinate roles; they earn nothing
extra for it and are not the permanent performer.

### The 50-Minute Run

The sample assumes **four teams performing one after another on one stage**. Four is an
example, not a limit. Judging and reveals are inside each segment, not added after it.

| Elapsed | Segment | Prep | Performances | Transitions (0:15 × teams) | Review + Reveal |
| --- | --- | --- | --- | --- | --- |
| 00:00–05:00 | Welcome, teams, rules, short demonstration | — | — | — | — |
| 05:00–11:00 | Faith Discovery | 1:30 | 4 × 0:45 = 3:00 | 1:00 | 0:30 |
| 11:00–19:00 | Dance | 2:00 | 4 × 1:00 = 4:00 | 1:00 | 1:00 |
| 19:00–27:00 | Prayer / Sacred Song | 2:00 | 4 × 1:00 = 4:00 | 1:00 | 1:00 |
| 27:00–39:00 | Bible Skit | 4:00 | 4 × 1:30 = 6:00 | 1:00 | 1:00 |
| 39:00–45:00 | Team Cheer | 2:00 | 4 × 0:30 = 2:00 | 1:00 | 1:00 |
| 45:00–48:00 | Final standings and recognition | — | — | — | Winners, individual recognition, a short reflection |
| 48:00–50:00 | Buffer and closing | — | — | — | Absorbs earlier delays |

All teams prepare at once. The first team to perform rotates each round so no team always
waits least. Waiting teams watch and encourage.

**The changeovers matter more now:** with co-GMs handing awards to the host or stepping up to
the laptop, the 0:15 transition between teams is when most awards get entered. Review can
take the rest.

**Estimate formula** (Setup recalculates it whenever teams or allowances change):

```
total = opening + Σ rounds [ prep + teams × (turn + transition) + reviewAndReveal ] + finale + buffer
```

At the sample allowances each extra team adds **6:00** (4:45 of performing plus five 0:15
transitions). Five teams estimate 56:00; six, 62:00.

- Keep **50 minutes** as the target and show any overrun plainly ("Estimated 56:00 · 6:00
  over the 50:00 target").
- Every allowance (prep, turn, transition, review and reveal) is editable before the event.
- Never shorten an allowance silently once it is announced, and never block creating a team
  to make the estimate fit. If the shortest workable turns still overrun, the host changes
  the format or the duration.
- Keep all five subjects by default; the host can skip a round explicitly when needed.

**Timers:** the host sees the overall event clock and the current phase timer, with Start,
Pause, Resume, Add 30 Seconds, End Preparation and Next Team. A timer reaching zero
**prompts** the host; it never publishes scores or cuts off a prayer. A time change applies
to the whole round, never to one team. Timers run on the laptop's clock and are saved as a
deadline (or the remaining time while paused), so a reload never restarts a countdown.

### Any Number of Teams

- Teams are a dynamic collection with stable IDs. Judging, scoring, the performance queue,
  results and exports never assume four.
- Searchable team and roster lists in the host console; standings that page on the display;
  a generated performance queue; a reveal that pages as awards grow. The full published
  history is always kept.
- Team colors may repeat once the palette runs out; names and emblems keep teams distinct.
  The palette's size is never a team limit.
- The host may add a team during play with a starting score of zero. It joins the end of the
  current round's queue if performances are still open, otherwise the next round. Completion
  points are never awarded retroactively.
- Test fixtures of 1, 4, 12 and 100 teams. Those are test sizes, not limits.

## Setup and Roles

### Before the Event

The host opens `/larp/` on the laptop (while online, so the page and the bonfire load and are
cached), then in **Setup**:

1. **Teams:** name, color, emblem and optional patron name for each. Any number.
2. **Roster:** youth's display names, each on a team. Typed one per line or pasted from a
   list, then assigned by dragging or with a team picker. A captain flag per team (optional).
   No ages, emails or other personal details.
3. **Co-GMs:** the other HTs' names (for example "Anh B.", "Chị C."). Names only: there are no
   accounts or passwords.
4. **Rounds:** prompts, base points and allowances; the estimate updates live.
5. **Display:** language mode, scenery, reduced motion, sound.

Setup can be done days ahead: the event is saved in the laptop's browser and can be exported
to a file and imported on another laptop.

### On the Day

The host connects the projector with the laptop's display set to **Extend**, chooses **Open
Display Window**, drags it to the projector and makes it full screen. A built-in checklist
walks through this (see [Host Console](#host-console)).

Roster corrections (a late arrival, someone moving team) are quick edits in **Teams &
Roster**. Points already earned stay with the team they were earned for.

### Roles

| Role | Who | What they do |
| --- | --- | --- |
| **Host** (Quản Trò) | The HT at the laptop | Runs everything: setup, timers, phases, awards, review, publishing, corrections |
| **Co-GM** | Other HTs, added by name | Gives awards in one of two ways (below). Their name is recorded on every award they give |
| **Captain** (Đội Trưởng) | A youth per team, optional | Coordinates roles. No powers in the app; a flag shown on the roster only |
| **Display** | The projector window | Shows public information only |

**How co-GMs give awards:**

1. **Hand them to the host.** The co-GM notes an award (on a printed Award Card or by
   telling the host) during a changeover or at Review. The host enters it and picks the
   co-GM under **From**, so Review and History show who gave what. Always works, needs no
   training.
2. **Judge Mode at the laptop.** During a changeover the co-GM steps up, chooses **Judge
   Mode**, picks their name, adds or edits their awards and chooses **Done**. Judge Mode
   shows only the award form, the current round's queue and the co-GM's own entries; it
   hides timers, phases, Setup and publishing, so a co-GM can't advance the game by
   accident. The host's console comes back on Done.

A co-GM in Judge Mode can edit or remove only their own unpublished awards, and only while
judging is open. The host can edit or remove anyone's. On one shared laptop this is about
clear attribution and avoiding mistakes, not security: the people at the laptop are the HTs.
An optional **Host PIN** (off by default) can be required to leave Judge Mode, for hosts who
want it.

| Capability | Host | Co-GM in Judge Mode | Display |
| --- | --- | --- | --- |
| Configure teams, roster, co-GMs and the event | Yes | No | No |
| Run timers, phases and performance order | Yes | No | Shows public state |
| Add team or individual modifiers | Yes (with **From**: self or a co-GM) | Yes, as themselves | No |
| Edit or remove own unpublished modifiers | Yes | Yes, while judging is open | No |
| Edit or remove another GM's modifiers | Yes | No | No |
| See the judging queue, its authors and private notes | Yes | Current round only | No |
| Review, publish, correct | Yes | No | No |
| See published awards and standings | Yes | Yes | Yes |

## Scoring

### Team Score

Signed whole-point adjustments: positive, zero or negative. The GM types a name and an amount
such as `+50` or `-25`. Negative modifiers use the same workflow as bonuses, for teams and
individuals alike.

- **Round score** = awarded completion points + published team adjustments in that round.
- **Team total** = sum of published round scores + published team corrections.

The host marks each team **Complete**, **Passed** or **Absent**. Complete awards the round's
base once; Passed and Absent award zero. Supporting or adapted participation counts as
complete. Every team needs a status before publishing, so an overlooked team never silently
gets zero.

Base values are 100, 200, 300, 500 and 300 (editable before the event, locked once it starts).
Completing every round gives **1,400 points**. Since every completing team gets the same
base, **bonuses decide the ranking**: the skit's 500 makes it no more decisive than the fact
round's 100 when both teams complete.

If the skit should matter more, agree on a larger bonus range before play. Suggested
briefing: 0–100 bonus points per team per ordinary round, 0–150 in the skit, across all HTs
combined. These are guidance, not caps, so that more judges present does not mean more
points available.

There is no hidden clamp. A deduction can make a round, a team total or an individual total
negative, and the preview and banner show the exact result: "Quá Giờ / Over Time −25" turns
a 100-point round into 75. Never show a deduction as positive or call it a bonus. Recommend
rare, modest deductions for rules announced in advance, and never use a negative banner to
ridicule anyone.

### Individual Score

Individuals earn points only from **awards aimed at them**, picked from the roster. Team
completion and team bonuses are not copied onto members, and individual awards do not add to
the team total. The two standings mean different things and nothing is counted twice.

Examples: "Invited Someone In +25", "Clear Narration +25", "Helped Another Team +50". Several
recipients can be chosen at once; the form then says **+25 Each**, lists the names and shows
the combined amount. The same goes for one adjustment applied to several teams.

- Review flags teams whose members have no individual recognition yet. It never invents
  awards.
- Never award points for being captain or being loudest.
- During the game the display shows team standings only.
- At the end: the display celebrates the leading individuals; the host console has the full
  individual ranking (and the results export).
- Ties share a place, the winning place included, shown as 1, 1, 3. No unannounced
  tiebreakers, and no promise that the final cheer can close any gap.

### Why This Balance Fits

This is a facilitated performance game. Fairness comes from equal opportunity, consistent
observation and understandable awards; custom scores give HTs flexibility but can't make
judging objective. So award reasons stay visible and the host's cross-team review stays fast.

Before the event, the HTs agree on three observable areas: **teamwork**, **preparation or
communication**, and **creativity or understanding of the prompt**. In the prayer round they
recognize preparation and inclusive participation, never sincerity, eloquence or volume.
These are facilitation guidelines, not preset modifiers or formulas. Equal bases, agreed
bonus ranges and rotating turn order keep it consistent. No surprise last-place gift or
double-score finale: both make earlier effort feel arbitrary. The cheer is the celebratory
finish even when the leader can't be caught.

## Judging, Review and Publication

### Adding a Modifier

The most common action takes a few keystrokes: pick a recipient, type a reason, enter the
amount, add. The round and the recipient stay visible throughout.

| Field | Behavior |
| --- | --- |
| Recipient Type | Team or Individual |
| Recipients | One or more, named; never everyone silently. Defaults to the team now performing |
| Name | Required, either language, up to 60 characters |
| Translation | Optional second-language text, up to 80 characters |
| Points | Required signed whole number (`+50`, `-25`, `0`) |
| Private Note | Optional, for the HTs; never shown on the display |
| From | The host or a co-GM (fixed to the co-GM in Judge Mode) |
| Round | The current round, fixed for this award |

- Reject blank names, fractions, NaN, infinity, and values or totals outside the safe integer
  range. Zero is allowed, shown as **Recognition · 0 Points**.
- No low hard cap. An adjustment larger (in absolute value) than the round's completion
  points is flagged for review, never changed.
- **Duplicate judgment:** the same name (compared without case or accents) for the same
  recipient in the same round warns; the GM can keep it anyway with a reason, since repeated
  recognition can be intentional.
- **Double submission:** a double-click or a repeated Enter never adds the award twice.
- **Templates and recent awards:** Save as Template, plus a list of recent awards. Using one
  fills an editable form; editing a template never changes history.
- **Award Cards:** Setup can print a sheet of blank cards (recipient, name, translation,
  points, from) for co-GMs who hand awards to the host.

### Review and Publication

1. During performances, the host (and co-GMs in Judge Mode) add and revise adjustments.
2. The host chooses **Review Round**. Judge Mode locks; entries already added stay.
3. The host compares teams, checks completion statuses, duplicates and large values, and
   edits, removes or adds entries (this is when handed-in awards are usually entered).
4. **Reopen Judging** goes back to editing. Otherwise **Publish and Reveal**.
5. The game saves one immutable round result (completion points and every adjustment) and
   starts the reveal on the display.
6. Standings follow the reveal. The host starts the next round when the room is ready;
   preparation never starts by itself during applause.

**Corrections:** a published round is never edited silently or awarded twice. The host adds
a named correction with a public reason (pointing at the original entry where there is one).
It adds or subtracts the difference without re-applying completion points and is published
explicitly. History keeps both. The MVP needs correction amounts, not a retroactive editor.

## Banner Reveal

The reveal is the visual highlight: readable from across the room, and short enough to
protect the next round's preparation.

For each team: its name and completion points, then its adjustments. Individual awards go
in their team's group, labelled **Individual Points** so they can't be mistaken for team
points.

```
┌────────────────────────────────────────────┐
│  ◆ ĐỘI PHAOLÔ · TEAM PAUL                  │
│                                            │
│     Cùng Nhau Tỏa Sáng                     │
│     Shine Together                         │
│                                            │
│              +75 Team Points               │
└────────────────────────────────────────────┘
```

Worked example: a completed skit gives 500; "Cùng Nhau Tỏa Sáng" adds 75, "Sáng Tạo /
Creativity" adds 50, "Quá Giờ / Over Time" subtracts 25. The team earns **600** this round.
A separate **+25 Individual Points** for Mai's narration gives Mai 25 and leaves the team's
600 alone.

- **Pacing:** about three seconds per short bilingual banner, with a gentle entrance and exit.
  Aim for **30–60 seconds per round**. Twelve banners at three seconds take 36 seconds before
  the team headers and standings.
- **Long queues:** group several readable rows onto one team page. Every published modifier
  appears; none is dropped to fit the time. Review shows the estimated reveal length.
- **Host controls:** Pause Reveal, Next Banner, Skip to Results. Skipping an animation never
  skips scoring; replaying a banner never adds points. If the display window is reloaded, it
  resumes at the reveal's current position.
- **Signs, not just colors:** bonuses get the flame's warm accent and a modest fire pulse;
  deductions and corrections get neutral stone styling and an explicit minus sign:
  **−25 Team Points**, **−25 Individual Points**.
- **Sound:** opt-in, started only after a user gesture, and silenced for the prayer round by
  default.

## UI/UX

### Principles

1. **No phones needed.** Everything the room needs is on the projector.
2. **One obvious next action.** The host console always shows the single next step as its
   biggest button (Start Preparation, Next Team, Review Round, Publish and Reveal, Start Next
   Round). Everything else is secondary.
3. **The display is a stage, not a dashboard.** One thing at a time, readable from the back of
   the room: the challenge, the performing team and the time left. Scores are for the reveal
   and the standings.
4. **Private stays private, by construction.** The display window is only ever sent the
   public view: no drafts, private notes or authors. The host console is never on the
   projector (that's what Extend mode and the checklist are for).
5. **Points always show their sign and their reason.** No bare numbers, no color-only meaning.
6. **The spectacle never blocks the game.** Scoring and timers never wait on the flame, a
   model loading or an animation finishing. Without WebGL, everything still works.
7. **Nothing is lost.** Every change is saved at once; a closed tab or a restart resumes the
   event where it was.

### Visual Language

Inherit the portfolio, then tune it for a room and a projector.

| Element | Portfolio | In the game |
| --- | --- | --- |
| Background | `--c-void` #07070b, `--c-shadow` #15131d | Same: the scene's night. Panels use the site's `--panel-bg` and 1 px `--line` frame |
| Text | `--c-bone` #e9e3d2; `--accent-hi` for colored text | Same. Body and numbers always in bone or `--accent-hi`, never in a team color |
| Accent | Follows the flame (`theme.js`) | Gilded Flame for the start and branding; the round's flame during play (below) |
| Team colors | — | A swatch, the emblem and the panel edge only, never text. Chosen with enough separation from the void and from each other; repeats allowed once the set runs out |
| Emblems | — | A small set of pixel-art shapes (shield, star, flame, cross, dove, crown, anchor, lamp…) so a team is never identified by color alone |
| Panels | `.panel`, dithered entrance (`ui/dither.js`) | Display: round cards and banners use the panel and its dither-in. Host console: plain panels, no entrance animation |
| Type | Inter (body), Cinzel (names), Pixelify Sans (pixel labels) | Inter for all Vietnamese, instructions and scores. Cinzel for English titles and English team names. Pixelify Sans for short labels and big numbers (digits and signs only). See [the font caveat](#verified-caveat-the-display-fonts-have-no-vietnamese-subset) |

**Type scale.** Display (1080p projector): round title 72–96 px, timer 160 px+, team name
48–64 px, banner name 56 px, body 28 px minimum. Host console: body 15–16 px, primary button
48 px tall, amount field 20 px.

**Contrast.** Text ≥ 4.5:1 on its background (7:1 for display body text, which is read from
far away on washed-out projectors). Test the display on an actual projector in a lit room;
the scene's darks crush there, so banners sit on an opaque panel, not straight on the 3D.

### Round Moods and Scene Cues

A presentation adapter (`src/larp/stage.js`) maps game events to scene calls. Game state never
waits for it, and every call is optional: a missing method or scene does nothing.

| Moment | Flame (suggested) | Scene cue | Knight |
| --- | --- | --- | --- |
| Welcome | `gilded` | Gentle idle; `stoke()` as each team is introduced | `wave` now and then |
| Faith Discovery | `ember` | `pulse()` when a team's turn starts | Seated, attentive |
| Dance | `rose` or `verdant` | `sparkle()` on turn start | Dancers for the round's intro only, then seated (no competing with the youth) |
| Prayer / Sacred Song | `spirit` or `azure` | **Calm**: no rings, no flashes, low motion, sound off, `setMaxFps` lowered | No gestures at all; never `praise` (a Dark Souls reference) near prayer |
| Bible Skit | `ember` | `stoke()` on turn start | Seated |
| Team Cheer | `gilded` | `ring()` after each team's turn | `hurrah` after each turn |
| Bonus banner | Round's | `pulse()` (small) | — |
| Deduction banner | Round's | Nothing: neutral by design | — |
| Round published | Round's | One `ring()` | `joy` |
| Final standings | `gilded` | `ring()` and `sparkle()` | A few knights dance round the fire, as in Bonfire Live |

Flames are admin-editable data, so the adapter resolves each key with `flameOr()` and the
colors may differ from these names. Review every cue at real speed from the display's
camera, as the repo's rules require; drop any that reads as noise.

**Reduced motion** (the OS setting, or a toggle in Setup): build the scene with
`createBonfire(…, { reducedMotion: true })`, no rings, flashes, shake or gestures, and banners
that cross-fade instead of sliding. Same information, same timing.

**No WebGL or a failed load:** the display shows a static, dimmed still of the bonfire (the
build already makes one for the site's social preview, `og/home.jpg`, from
`assets/source/bonfire-preview.png`) behind the same HTML panels. Nothing else changes.

### Shared Display

The second window (`/larp/#/display`), opened from the host console with **Open Display
Window**, dragged to the projector and made full screen (`toggleFullscreen()`). It only
shows; it has no controls beyond Full Screen and a hidden-until-hover Close.

Layout: the bonfire fills the screen; HTML panels sit over it in fixed zones, leaving the
fire visible in the middle third.

```
WELCOME                                       PERFORMING
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ LỬA TRẠI NGHĨA SĨ                    │      │ VÒNG 4 · HOẠT CẢNH KINH THÁNH        │
│ Nghĩa Sĩ Campfire                    │      │ Round 4 · Bible Skit                 │
│                                      │      │                                      │
│        (bonfire)                     │      │        (bonfire)          ◆ ĐỘI      │
│                                      │      │                             PHAOLÔ   │
│ ◆ Đội Phaolô   ★ Đội Giuse           │      │                          Team Paul   │
│ ✚ Đội Maria    ⚓ Đội Phêrô           │      │                                      │
│ 5 rounds · 50 minutes                │      │ Next: ★ Giuse          ███ 1:12      │
└──────────────────────────────────────┘      └──────────────────────────────────────┘

PREPARATION                                   STANDINGS
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ VÒNG 2 · VŨ ĐIỆU · Dance             │      │ BẢNG XẾP HẠNG · Standings            │
│                                      │      │ 1  ◆ Đội Phaolô        1,040   ▲1    │
│ "Create four repeatable movements    │      │ 2  ★ Đội Giuse           985   ▼1    │
│  that tell a story about working     │      │ 2  ✚ Đội Maria           985   –     │
│  together."                          │      │ 4  ⚓ Đội Phêrô           870   –     │
│        (bonfire)          CHUẨN BỊ   │      │        (bonfire)                     │
│                       Preparation    │      │                    Page 1 of 3       │
│                              1:45    │      │                                      │
└──────────────────────────────────────┘      └──────────────────────────────────────┘
```

- **One focus per phase.** Briefing: the round card (number, bilingual title, prompt).
  Preparation: the prompt stays up with the timer. Performing: the team and the time left,
  big; the next team small. Review: a calm "HTs are reviewing · Ban Giám Khảo đang duyệt điểm"
  card (no hint of the scores). Reveal: banners. Results: standings.
- **Welcome:** the teams and their emblems, so youth find their team on the screen. Optionally
  each team's members, paged, when the host assigns teams at the door.
- **Timer:** digits in Pixelify Sans; the last 10 seconds turn the ring amber, never red and
  never flashing. At zero it reads "Time · Hết Giờ" and holds; it does not buzz or cut off.
  In the prayer round the timer is small and never animates.
- **Standings:** shared places shown as equal numbers ("2, 2, 4"). Movement arrows only after
  round 1. With many teams, page automatically (eight rows a page at 1080p, eight seconds
  each), the current page shown. Individuals: the leaders only, never a list of low or zero
  scores.
- **Team added mid-game:** a quiet "New team · Đội mới" chip, never a banner.
- **Never shown:** private notes, which GM gave what, drafts and host controls.
- **If the host window closes:** the display keeps the last state and shows a small "Host
  window closed" chip in a corner; reopening the host picks up again.

### Host Console

The host's window on the laptop screen (`/larp/#/host`). Wide layout, three columns at
≥ 1200 px, stacked tabs below. It is a working tool: clarity over fantasy chrome, while still
using the site's panels, type and accent.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Round 4 Bible Skit · PERFORMING      Event 31:20 / 50:00 (est. +0:40)  ▣ Display ✓ │
│                                                        [ Next Team: ★ Giuse ▸ ]    │
├───────────────────────┬──────────────────────────────────┬─────────────────────────┤
│ QUEUE                 │ ADD AWARD          [Judge Mode]  │ PROJECTED               │
│ ✓ ◆ Phaolô  Complete ▾│ (Team)(Individual)               │ ◆ Phaolô  500 +100 = 600│
│ ▸ ★ Giuse   —        ▾│ To    [◆ Đội Phaolô         ▾]   │ ★ Giuse     —           │
│   ✚ Maria   —        ▾│ Name  [Cùng Nhau Tỏa Sáng     ]  │ ✚ Maria     —           │
│   ⚓ Phêrô   —        ▾│ Trans [Shine Together         ]  │ ⚓ Phêrô    —           │
│                       │ Points [−][ 75 ][+]  From [Me ▾] │                         │
│ Turn 1:12  [Pause]    │ [ Add +75 ]                      │ No individual awards    │
│ [+30 s]               │ THIS ROUND                       │ yet: Giuse, Maria       │
│                       │ +75 Phaolô · Shine Together · Me │                         │
│                       │ +50 Phaolô · Creativity · Anh B. │ Reveal est. 0:42        │
│                       │ −25 Phaolô · Over Time · Me      │                         │
├───────────────────────┴──────────────────────────────────┴─────────────────────────┤
│ Tabs: Run · Teams & Roster · Review · History · Setup             [Preview Display] │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** round and phase, event clock against the target (with the live estimate), the
  display window's state (open, closed, or not yet opened), and the **one next action** as
  the biggest button. Its label always names what it will do ("Publish and Reveal Round 4").
- **Completion status** sits on each team in the queue (Complete / Passed / Absent). Unset
  shows as an outlined "—" and blocks publishing; the Publish button says why ("2 teams need
  a status").
- **Add Award sits next to the queue**, and picking a team in the queue selects it as the
  recipient. **From** defaults to the host and lists the co-GMs.
- **Signed amounts:** `−` / `+` toggles beside the field, and it accepts typed `-` and `−`.
  The Add button repeats the signed value ("Add −25", "Add +25 Each · 3 people").
- **Tabs:** Run (above), **Teams & Roster** (teams, roster, captains, co-GMs, late arrivals),
  **Review** (side-by-side teams; flags for duplicates, large values and teams without
  individual recognition; reveal length), **History** (published rounds, corrections),
  **Setup** (rounds, allowances, estimate, language, scenery, Award Cards, export and
  import, Delete Event Data).
- **Preview Display** shows what the projector shows, in a small frame.
- **Projector checklist** on first opening the display: "Set your display to Extend, not
  Mirror", "Drag this window to the projector", "Press Full Screen", with a **Show Test
  Pattern** button that puts the round title, a banner and a timer on the display to check
  readability from the back.
- **Confirmation** only for what is hard to undo: Publish and Reveal, Skip Round (when drafts
  exist), End Event, Import (replaces the current event), Delete Event Data. Ordinary draft
  edits are instant and reversible (Undo on delete for a few seconds).
- **Keyboard** (listed in the `?` overlay, `keysOverlay.js`; silent while typing, `typing()`):
  `Space` pause/resume the timer, `N` next team, `T` add 30 seconds, `A` focus Add Award,
  `J` Judge Mode, `?` the list. **No single key publishes**: Publish needs its button and its
  confirmation.
- **Projected totals** update live as entries change, labelled "Projected · not published".
- **Saved indicator:** a quiet "Saved" that turns into a clear warning if the browser refuses
  to store (private window, full storage), with **Export Backup** offered right there.

### Judge Mode

The same window, taken over by a co-GM during a changeover.

```
┌────────────────────────────────────────────────────────────┐
│ JUDGE MODE · Anh B.            Round 4 Bible Skit   [Done] │
├────────────────────────────────────────────────────────────┤
│ (Team)(Individual)                                         │
│ To     [★ Đội Giuse                ▾]                      │
│ Name   [Sáng Tạo                     ]                     │
│ Trans  [Creativity                   ]                     │
│ Points [−][ 50 ][+]                                        │
│ Note for HTs (private) [                       ]           │
│ [ Add +50 ]                                                │
├────────────────────────────────────────────────────────────┤
│ Recent: Sáng Tạo +50 · Quá Giờ −25 · Tinh Thần +25 …       │
│ MY AWARDS THIS ROUND                                       │
│ +50 Giuse · Creativity                       [Edit][✕]     │
│ ALSO THIS ROUND (others')                                  │
│ +75 Phaolô · Shine Together · Host                         │
└────────────────────────────────────────────────────────────┘
```

- Opened with **Judge Mode** (or `J`), then the co-GM picks their name from a list; the last
  co-GM is remembered for a quick return.
- Big, plain and fast: the recipient defaults to the team that just performed.
- Others' awards are listed (so co-GMs see the duplicate warning in context) but can't be
  edited.
- **Done** returns to the host console (asking for the Host PIN if the host set one). Starting
  Review locks Judge Mode with a message saying why.
- The timer keeps running in the background; the display is unaffected.

### States the Host Console Handles

| State | What the host sees |
| --- | --- |
| Display window not open | The top bar says so, with Open Display Window |
| Display window closed mid-event | The top bar warns; reopening resumes the display at the current phase (and reveal position) |
| Storage refused or full | A clear warning with Export Backup; play continues in memory |
| Reopened after a crash or restart | "Resume Event: Round 3, Performances" with the timer as it was saved (paused if it was paused; otherwise continuing from the saved deadline, with a prompt if it ran out meanwhile) |
| Imported backup from another laptop | A summary (teams, rounds published) before replacing anything |
| WebGL unavailable on the display | A note in the top bar; the display uses the static fallback |
| Event finished | Final standings, Export Results, Export Backup and Delete Event Data |

### Language and Accessibility

- **Modes:** Bilingual (Vietnamese title, English subtitle; default), English first,
  Vietnamese only, chosen in Setup for the display. The host console follows its own setting.
- **Strings** come from an explicit translation map (`src/larp/strings.js`), never generated
  at runtime. Custom award names are shown as entered, with the HT's optional translation.
- **Title Case** for English labels (`titleCase()`), sentence-case hints of 160 characters or
  fewer, per the repo's rule. Vietnamese is written out in its correct case and diacritics.
- **Fonts:** see [the caveat](#verified-caveat-the-display-fonts-have-no-vietnamese-subset).
  Check Vietnamese line height: stacked marks (ấ, ổ, ự) need about 1.35 line height in Inter
  to avoid clipping.
- **Keyboard and focus:** every host control reachable by keyboard with a visible focus ring;
  dialogs trap focus and return it (`focus.js`, `restMenu.js`).
- **Screen readers:** the timer is not a live region (it would chatter); phase changes and
  save warnings are announced politely.
- **Zoom:** the host console works at 200% text zoom.
- **Motion:** honor `prefers-reduced-motion`, plus the Setup toggle for the display.
- **Never color alone:** signs on numbers, emblems on teams, words on states.

## Vietnamese and English Wording

Product translations unless a source is cited above. They follow the local đoàn's
preferences; they are not official titles.

| Vietnamese | English | Use |
| --- | --- | --- |
| Thiếu Nhi Thánh Thể | Eucharistic Youth Movement | TNTT context |
| Nghĩa Sĩ | Companion | Participant branch; keep the Vietnamese prominent |
| Huynh Trưởng | Youth Leader | HT role in the real activity |
| Đoàn Sinh | Youth Member | General participant |
| Quản Trò | Game Leader | Host label in this activity |
| Ban Giám Khảo | Judging Team | Host and co-GMs as a group |
| Chế Độ Giám Khảo | Judge Mode | A co-GM's turn at the laptop |
| Đội | Team | Competition group |
| Đội Trưởng | Team Captain | Youth coordination role |
| Danh Sách | Roster | The youth's names by team |
| Vòng | Round | One challenge |
| Chuẩn Bị | Preparation | Shared prep period |
| Hết Giờ | Time | Timer at zero |
| Điểm | Points | Score unit |
| Điểm Thưởng | Bonus Points | Positive adjustment |
| Điểm Trừ | Point Deduction | Negative adjustment |
| Điều Chỉnh Điểm | Point Adjustment | General modifier or correction |
| Tên / Giá Trị | Name / Value | Modifier fields |
| Duyệt Điểm | Review Scores | Host review |
| Công Bố Điểm | Reveal Scores | Public result action |
| Bảng Xếp Hạng | Standings | Rankings |
| Sáng Tạo | Creativity | Example award name |
| Tinh Thần Đồng Đội | Team Spirit | Example award name |
| Quá Giờ | Over Time | Example adjustment name |

Use the functional labels **Host** and **Co-GM** beside the Vietnamese in the app. Don't call
the host Trại Trưởng unless the event's actual leader chooses that title. Being a co-GM in
the app is not a TNTT role.

## Architecture

### Files

| Path | What it is |
| --- | --- |
| `larp/index.html` | The page, one entry for both windows, routed by hash like the site: `#/host` (default) and `#/display` |
| `src/larp/rules.js` | Pure game rules: configuration, schedule estimate, scoring, roles, phase transitions, validation. No DOM, no three.js |
| `src/larp/state.js` | The command reducer over the domain records: `reduce(state, command)` → new state, events or an error; plus the public projection for the display |
| `src/larp/store.js` | Saving after every command, restoring, schema versions and migrations, export and import |
| `src/larp/channel.js` | The link between the host and display windows (`BroadcastChannel`, public projection only) |
| `src/larp/strings.js` | The Vietnamese/English string map and points formatting |
| `src/larp/host.js`, `judge.js`, `display.js` | The host console, Judge Mode and the display |
| `src/larp/stage.js` | The presentation adapter: game events → scene cues, all optional |
| `src/larp/larp.css` | The game's styles over `src/tokens.css` |
| `test/larp*.test.mjs`, `e2e/larp.spec.mjs` | Unit tests for rules, state and store; a browser spec with the host and display pages |

Build and site hygiene:

- Add `larp: resolve(import.meta.dirname, 'larp/index.html')` to `vite.config.js`'s inputs,
  keeping the `BASE` handling for GitHub Pages.
- Add `src/larp/` to `firstLoadGuard`'s `SHOW_ONLY` pattern so the portfolio's first load can
  never carry game code.
- Keep `/larp/` out of `sitemap.xml`, add `Disallow: /larp/` to `robots.txt` and mark the page
  `noindex`.
- Load three.js and the scene **only in the display window**, lazily (`import()`); the host
  console never loads them. Dispose the scene on leaving.
- No game data goes in `src/content.json`. No model rebuild; the knight's existing gestures
  only, after visual review.

### Working Offline

The game needs the network only to load the page. To make the event safe on venue Wi-Fi that
drops (or none at all):

- The host opens `/larp/`, opens the display once (so the bonfire's model and three.js load),
  and leaves both open; nothing after that touches the network.
- A Setup check, **Ready for Offline**, confirms the page's files, the scene's model and the
  fonts are loaded, and says what isn't.
- A service worker that caches `/larp/` for a fully offline cold start (a reboot with no Wi-Fi)
  is a stretch goal: it needs care with GitHub Pages' paths and deploys, and must never cache
  the portfolio's own pages. Until then, the guidance is "load it while online, don't close
  the browser".

### The Two Windows

- The host window holds the one true state and is the only one that changes it.
- After every change it saves (see below) and posts the **public projection** on a
  `BroadcastChannel` named for the event. The projection contains only what the display may
  show: phase, round card, timer deadline, the performing team, published results, the
  reveal position and standings. No drafts, private notes, authors or roster details beyond
  what a published award names.
- The display window renders whatever projection it last received. When it opens or reloads
  it asks for the current projection, so it catches up at once (mid-reveal included).
- Both windows are the same page on the same laptop, so this needs no network and no server.
  The display never writes state.
- If more than one host window is opened by mistake, the second one sees that another host
  window is active (a heartbeat on the channel) and offers to take over or to close, so two
  windows never edit the same event at once.

### Saving and Recovery

- **Saved after every command**, in the browser's storage under the game's own key prefix
  (`larp.`), never touching Bonfire Live, Painter or site settings. IndexedDB is preferred
  for size; `localStorage` is acceptable for the MVP if the saved event stays small.
- **Versioned:** the saved event carries a schema version; older versions are migrated on load,
  following `src/scenes.js`'s `MIGRATIONS`, with a test that loads each old shape (the repo's
  "saved state never breaks" rule).
- **Resume:** reopening `/larp/` offers to resume the saved event. Timers are saved as a
  deadline or remaining time, so a reload never restarts one.
- **Export Backup:** the whole event as a JSON file (private notes included) to move to another
  laptop or keep safe. **Import** restores it after a summary and a confirmation.
- **Export Results:** teams, display names, published scores and award reasons, without
  private notes (CSV and a printable page).
- **Delete Event Data:** removes the saved event from the laptop. Nothing leaves the laptop
  unless the host exports it.

### Phases

Setup → Running → Finished. Within each round:

`Briefing → Preparation → Performances → Review → Reveal → Results`

- Only the host advances phases, and the rules validate every transition.
- Timers can pause within a phase. Review can return to Performances (judging reopened).
  Results advances to the next Briefing.
- A skipped round records Skipped, discards its unpublished awards and counts zero; it can't
  be partly counted. Confirm when drafts exist.
- Publication locks the result; revisiting Results or reloading is never a new scoring event.

### Domain Records

| Record | Required information |
| --- | --- |
| Event | ID, schema version, configuration, phase, revision |
| Team | Stable ID, name, color, emblem, optional patron name, admission round |
| Roster Member | Stable ID, display name, team ID, captain flag |
| GM | Stable ID, display name, host flag |
| Round | ID, category, prompt, base points, durations, order, completion statuses, skipped flag |
| Adjustment | ID, round ID, recipient type and ID, name, translation, signed points, author (GM ID), private note, status, batch ID |
| Published Result | Unique round ID, frozen completion awards and adjustments, totals, publication time |
| Correction | ID, target, signed difference, public reason, author, original reference if any |
| Timer | Running or paused, deadline or remaining time |
| History Entry | Actor, command ID, action, timestamp, affected IDs |

- A batch award is one record per recipient sharing a batch ID. A published individual award
  snapshots the member's team at that moment.
- **Scores are derived** from published results and corrections, never kept as separate
  totals that could drift. One publication per round; command IDs make a repeated command
  (a double-click) harmless.
- Names and award text are plain text everywhere, escaped when placed in markup.

## Acceptance Criteria

Write the meaningful tests for rules, state and saving before implementing each stage. Use
focused visual checks for presentation.

### Rules, State and Saving

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | The host creates any number of teams and a roster | Every team and member is available for judging, queues, scoring and export |
| A02 | The host adds co-GMs by name | They appear under **From** and in Judge Mode |
| A03 | A co-GM in Judge Mode edits another GM's entry, or reaches publishing or phase controls | Not possible |
| A04 | The host and a co-GM add different awards to the same team | Both remain, each with its author |
| A05 | Add is double-clicked or Enter repeated | The award exists once |
| A06 | A second GM uses the same name for the same recipient | A duplicate warning; both can be kept with a reason |
| A07 | The display window's messages are inspected during judging | Drafts, private notes and authors are absent |
| A08 | +75, +50 and −25 on a completed 500-point skit | Preview and published team score both equal 600 |
| A09 | Mai also receives +25 individually | Mai gains 25; the team's round score stays 600 |
| A10 | Three recipients get +25 each | The form names all three and says +25 each; each gets one award |
| A11 | Review starts while a co-GM is in Judge Mode | Judge Mode locks with a reason; entries already added stay; the host can reopen judging |
| A12 | One team's completion status is unset | Publishing is blocked until it is set |
| A13 | Publish is double-clicked | One immutable round result, one set of points |
| A14 | The host skips or replays banners | Scores unchanged; all awards remain in history |
| A15 | A published +75 should have been +50 | A −25 correction changes the total once; both records remain |
| A16 | The host window is reloaded, or the browser restarts, mid-round | Phase, scores, drafts and timer resume from the save without duplication |
| A17 | The display window is closed and reopened mid-reveal | It resumes at the current phase and reveal position |
| A18 | A backup is exported and imported on a fresh browser | The event is identical; private notes included in the backup, excluded from Export Results |
| A19 | Teams or individuals tie | They share their place (1, 1, 3) |
| A20 | Teams are added beyond the sample schedule | Creation stays available; the estimate grows and shows the overrun |
| A21 | WebGL fails or reduced motion is on | Controls, scores and award text stay usable and readable |
| A22 | A custom name contains markup or Vietnamese accents | It renders as safe, readable text with correct diacritics |
| A23 | A team passes, a round is skipped, or a deduction exceeds the base | Scores follow the zero-completion, skipped-round and signed-arithmetic rules |
| A24 | An older saved event format is loaded | It migrates and plays on without loss |
| A25 | A second host window is opened | Only one window can edit at a time |
| A26 | Fixtures of 1, 4, 12 and 100 teams | Queues, judging, paging, scoring and exports include every team |
| A27 | A team or individual gets a custom −25 | Preview, published total, negative banner and history agree |
| A28 | A team is added after a round was published | It starts at zero; completed rounds are unchanged |

### UI/UX

| ID | Scenario | Required result |
| --- | --- | --- |
| U01 | Vietnamese titles and team names on the display | No mid-word font fallback: a string the display font can't fully cover is set entirely in Inter |
| U02 | The display from 6 m on a 1080p projector | Round title, team name, timer and banner text are readable (checked in person, using Show Test Pattern) |
| U03 | A negative modifier anywhere | A minus sign and the word Points appear; meaning never depends on color |
| U04 | The host console in every phase | Exactly one primary next-action button, labelled with what it does |
| U05 | Entering −25 with the sign toggle or typed `-` or `−` | The value is −25 and the button reads "Add −25" |
| U06 | Storage is refused (private window) | A clear warning and Export Backup; play continues |
| U07 | The prayer round on the display | No rings, flashes, knight gestures or sound; the timer doesn't animate |
| U08 | The portfolio's first load after the game is added | No `src/larp/` module in it (`firstLoadGuard` stays quiet) |
| U09 | The host console at 200% text zoom, keyboard only | Every control usable, focus visible, nothing clipped |
| U10 | The final standings with many youth | Leading individuals only on the display; the full ranking in the host console |
| U11 | The network is switched off after loading | The full five-round event runs to the end with both windows |

The four-team pilot should run all five rounds within 50 minutes, reveals included, with the
co-GMs using both ways of giving awards. Larger pilots validate their adjusted schedule
against the same target. Watch whether youth understand their award reasons, quieter members
find useful roles, and co-GMs can get their awards in without missing performances.

## Estimate

From the 2026-10-10 estimate workflow (six agents sizing the earlier, multiplayer version),
adjusted for this version by judgment rather than re-run: the Worker, sessions, phone screens
and multi-device testing, the riskiest and slowest parts, are gone.

| | Ultracode (agents) | Medium workflows |
| --- | --- | --- |
| Rules, state and saving | 4–7 h | 5–10 h |
| Host console, Judge Mode, display and the scene | 4–8 h | 6–12 h |
| Integration, browser tests, docs | 1–3 h | 2–4 h |
| **Total** | **~8–14 h** | **~12–24 h** |

Owner and HT time, which agents can't do: confirming the open rule choices (about 0.5 h), a
Vietnamese wording review, the projector check and a 50-minute rehearsal, and authorizing the
commits, pull request and deploy. GitHub Pages is the only deploy.

## Implementation Sequence

1. **Rules and state:** configuration, the schedule estimate, scoring, roles, phase
   transitions, timers, idempotent publication, saving and migrations, with the A-series
   tests on deterministic fixtures.
2. **Host console and Judge Mode:** setup, roster, the run loop, awards, review, publishing,
   history, export and import, resume.
3. **Display and presentation:** the display window and its channel, bilingual round cards,
   award banners, the scene adapter, reduced motion and the static fallback; the U-series
   checks.
4. **Rehearsal:** run the sample schedule at real speed on a real projector with the network
   off, exercise corrections, reloads and both co-GM workflows, and tune friction.

MVP done means: unrestricted team creation, positive and negative modifiers, team and
individual scoring, both co-GM workflows, the two-window display and saving that survives
reloads. If percentage or multiplier modifiers are requested later, define stacking order,
rounding and correction semantics first; don't infer them from the word "modifier". If co-GM
phones are requested later, add them as an optional peer-to-peer link to the host window that
the game never depends on.

Working in this repo: read `CLAUDE.md`, `AGENTS.md` (if present) and `CONTRIBUTING.md`
first; the owner's instructions win where they differ. Preserve unrelated changes and saved
formats. Use `npm run test:fast` while working and `npm run check` before every commit; run
focused browser specs (`npm run e2e -- larp`), not the whole suite. Check visible effects at
real speed. Pushes, pull requests, tags and deployment need the owner's say-so; this
document authorizes none of them, nor any change to the portfolio's published content.

## Prompt to Use with Claude Code

Read `docs/design/nghia-si-campfire.md` as the product design for a new Nghĩa Sĩ campfire game
in this repository, after the repository's own instructions. Treat Confirmed Requirements as
required behavior and Recommended Defaults as the starting configuration. It runs on one
laptop with no network: a host console window and a projector display window, the host
entering teams and roster, co-GMs giving awards through the host or in Judge Mode. Preserve
the five fixed subjects, the 50-minute target with team-count-aware estimates, unrestricted
team creation, custom GM-named positive and negative adjustments, end-of-round banners and
separate team and individual standings. Do not add an opening call-and-response, phones or a
server.

Inspect only the relevant modules (confirm the scene API and font coverage this design
cites), then give a concise implementation plan mapped to the acceptance criteria. Name real
blockers; use the documented defaults for routine choices. Write the meaningful tests first
and implement in the listed stages. Keep game state independent of the Bonfire presentation,
and demonstrate a full five-round event with the network off before calling it done.

Use the existing Bonfire assets, tokens and UI pieces with the plain JavaScript stack. Keep
the host console clear and the spectacle on the display. Do not add omitted features or
rewrite existing apps. Finish each stage with the relevant checks and a short report of what
works, what was verified and what remains. Do not push, open a pull request or deploy unless
I explicitly authorize it.
