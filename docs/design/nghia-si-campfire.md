# Lửa Trại Nghĩa Sĩ (Nghĩa Sĩ Campfire): design notes

Status: **design only, nothing implemented** (refined 2026-10-10 from the first handoff).
Source: Newton's request for a browser companion to a 50-minute, in-person TNTT Nghĩa Sĩ
activity, built on the Bonfire Portfolio's scene, look and UI pieces. This version keeps every
confirmed requirement, checks the portfolio references against the code, and adds the UI/UX
for each screen.

Teams perform five short challenges while Huynh Trưởng (HTs) award named points. A shared
screen runs the rounds, reveals the awards as banners and shows the standings around the
portfolio's pixel-art bonfire. **The people in the room are the game.** The website handles
joining, pacing, judging together and the celebration. Youth should spend most of the
activity preparing, performing and watching each other, not looking at phones.

## Contents

1. [Product Decisions](#product-decisions)
2. [Built on the Bonfire Portfolio](#built-on-the-bonfire-portfolio)
3. [Nghĩa Sĩ Identity and Youth Experience](#nghĩa-sĩ-identity-and-youth-experience)
4. [The Game](#the-game): the player's explanation, the five rounds, the 50-minute run
5. [Lobby and Roles](#lobby-and-roles)
6. [Scoring](#scoring)
7. [Judging, Review and Publication](#judging-review-and-publication)
8. [Banner Reveal](#banner-reveal)
9. [UI/UX](#uiux): principles, visual language, the scene's cues, each screen, accessibility
10. [Vietnamese and English Wording](#vietnamese-and-english-wording)
11. [Architecture](#architecture): files, state, multiplayer, records
12. [Acceptance Criteria](#acceptance-criteria)
13. [Implementation Sequence](#implementation-sequence)
14. [Prompt to Use with Claude Code](#prompt-to-use-with-claude-code)

## Product Decisions

### Confirmed Requirements

| # | Requirement |
| --- | --- |
| R1 | The audience is **Nghĩa Sĩ**. |
| R2 | The activity lasts **50 minutes**. |
| R3 | **Any number of teams**: no hard-coded game or lobby team limit. |
| R4 | **Five rounds**, one subject for everyone per round: fun fact, dance, prayer or song, Bible scene, team cheer. |
| R5 | Players join with a lobby code and choose from teams the host set up. |
| R6 | Team **and** individual standings both matter. |
| R7 | The main GM is the host, and can grant or revoke GM access for other joined participants (the other HTs running the activity). |
| R8 | GMs name modifiers and choose their values themselves, **negative ones included**, for teams or individuals. |
| R9 | Modifiers appear as banners at the end of the round: who gets them and how many points they add or subtract. |
| R10 | Reuse the Bonfire Portfolio's engine, assets and visual language. |
| R11 | Vietnamese terminology with English translations. |

### Recommended Defaults

Implementation defaults proposed here, not additional requirements. Settings marked
editable stay editable.

| Decision | Default |
| --- | --- |
| Event size | No team limit; the sample timetable uses four teams |
| Team size | Host-configured; roughly equal sizes recommended |
| Staffing | One host and one or two assisting HTs |
| Display | One laptop/projector or large screen, separate from the private GM controls |
| Phones | Useful for joining; optional during play |
| Scoring | Completion points plus custom signed point adjustments |
| Publication | The host reviews and publishes one whole round at a time |
| Language | Vietnamese titles with English subtitles; English-first and Vietnamese-only modes |
| Working title | Lửa Trại Nghĩa Sĩ · Nghĩa Sĩ Campfire |
| Route | A separate `/larp/` page in this repository, like `/visualizer/` and `/painter/` |
| Accent | The **Gilded Flame** (yellow, a nod to Nghĩa Sĩ) over the site's charcoal and bone |

The original working title, **Larp Simulator: Holy Knights**, can stay a subtitle or
nickname. It does not identify the participants as Ngành Hiệp Sĩ. Final branding (and the
route's name, which youth will see in the address bar) is the owner's choice.

### Out of Scope for the First Release

Action cards, wildcards, random double-point rounds, audience voting, automatic microphone
scores, automatic last-place bonuses, percentage or multiplier modifiers, an opening
call-and-response, custom 3D models, persistent accounts and parallel stages. This design
supersedes the earlier brainstorming that included them.

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
| `src/bonfire/knightGestures.js` `GESTURES` (`praise`, `wave`, `bow`, `point`, `beckon`, `shrug`, `hurrah`, `joy`, `dance`) and `knights.js` | The knight as a mascot: a wave in the lobby, `hurrah`/`joy` for a reveal, dancers for the cheer round. Bonfire Live already shows several knights dancing round the fire |
| `src/visualizer/cards.js` | The pattern for the round cards and award banners: an HTML card drawn **over** the canvas, timed, never part of the 3D frame |
| `src/visualizer/output.js` | Precedent for a projector window. The game's display is its own page instead of a streamed canvas (see [Shared Display](#shared-display)) |
| `src/tokens.css` | Colors (`--c-void`, `--c-shadow`, `--c-stone`, `--c-wood`, `--c-bone`, the accent ramp) and the three typefaces. See the font caveat below |
| `src/styles.css` `.panel`, `src/ui/dither.js` | The framed panel and its dithered entrance, for the display's phase changes |
| `src/ui/shell.js` (`q`, `qa`, `typing`, `toggleFullscreen`) | Page basics; `typing()` keeps the host's shortcuts quiet while they type an award name |
| `src/ui/spatial.js`, `restMenu.js`, `keysOverlay.js`, `focus.js` | Arrow-key navigation, the menu dialog, the `?` shortcut list, focus handling |
| `src/ui/tooltip.js`, `describedTip.js`, `fields.js` | Hints with a "?" that also reach screen readers; settings markup for the host's setup |
| `src/ui/breakpoints.js` `NARROW = 760` | The phone breakpoint, the same as Live's and the Painter's |
| `src/ui/audio.js` | Synthesized sound, muted until switched on: the model for the reveal's optional sound |
| `src/text.js` `titleCase()` | English labels only. Vietnamese strings are written out in full, never title-cased by code |
| `src/html.js` `esc()` | Escaping any text placed in markup (names and award reasons are plain text) |
| `vite.config.js` | A fourth `input` entry; `firstLoadGuard` keeps game code out of the portfolio's first load |

### Verified Caveat: The Display Fonts Have No Vietnamese Subset

The `@fontsource` packages the site ships (`cinzel@5.3.0`, `pixelify-sans@5.3.0`) carry only
`latin` and `latin-ext` (plus `cyrillic` for Pixelify Sans). Vietnamese tone-mark letters
(the Latin Extended Additional block, such as **ử, ạ, ệ, ở**) are not in either.
**Inter** has a Vietnamese subset. Without care, "Lửa Trại" in Cinzel draws "ử" in a
fallback font mid-word.

So:

- Vietnamese text is set in **Inter** (500 or 600 for titles).
- Cinzel (names and English titles) and Pixelify Sans (short labels, numbers on banners) are
  used only for strings every character of which they cover. A small helper decides per
  string, and the whole string falls back to Inter, never single letters.
- Team names are the main risk: even the word **Đội** (ộ, U+1ED9) is outside Cinzel, so a
  name like "Đội Phaolô" always falls back. Show the Vietnamese team name in Inter and use
  Cinzel for the English line ("Team Paul") or a bare patron name ("Phaolô" fits). The setup
  screen previews each name in its display font and says when it falls back.
- Adding a Vietnamese-capable display face is a later option, not an MVP task.

### What Is New

A `larp/index.html` entry and a `src/larp/` folder: game rules and state (no DOM, no three.js),
a transport interface, the four screens (display, host, co-GM, player) and a presentation
adapter that turns game events into scene cues. A separate Cloudflare Worker hosts
multiplayer. Nothing in `src/bonfire/`, the site, Bonfire Live, the Painter or the admin
changes behavior. See [Architecture](#architecture).

## Nghĩa Sĩ Identity and Youth Experience

VEYM's bylaws place Nghĩa Sĩ at ages 13–15 and translate the branch as **Companion**. Use
the local group's actual roster; never ask players for their age.
[VEYM bylaws, Article 20 and glossary](https://old.veym.net/resources/files/NoiQuy2019.pdf)

- **Tone:** adventurous and socially comfortable for young teens. A clear challenge, and the
  team decides how to deliver it. No babyish rewards, no forced solo performances, no humor
  aimed at embarrassing anyone.
- **Recognition:** HTs reward what they can observe: explaining clearly, inviting a quieter
  teammate into a role, helping another team, recovering together after a mistake.
- **Roles for everyone:** actors, narrators, fact finders, rhythm keepers, organizers.
  Seated movement, notes and supporting roles all count as taking part.
- **Faith, handled with care:** Catholic identity lives in the content, the teamwork and the
  tone. The score is **Điểm / Points**; positive awards are **Điểm Thưởng / Bonus Points**.
  The game never measures holiness, prayer quality or anyone's faith. Grace, blessings,
  Communion and **Bó Hoa Thiêng** are never game mechanics: Bó Hoa Thiêng already means a
  spiritual bouquet of prayer and sacrifice.
  [VEYM spiritual bouquet campaign](https://veym.net/news/posts/celebrating-the-veym-national-day-of-prayer-with-the-2023-spiritual-bouquet-campaign-for-rosary-month-and-the-holy-ween-costume-contest)
- **Not official:** this is a campfire-themed youth activity, not an official TNTT campfire
  ceremony. Granting app access does not appoint anyone to a TNTT leadership role.
- **The knight** is the portfolio's mascot, not a symbol of a TNTT branch.

## The Game

### Explained to a Player

> Join your team. Each round everyone gets the same kind of challenge: share a fact, dance,
> pray or sing, act out a Bible story, then finish with your team cheer.
>
> You get a few minutes to prepare together. Decide who does what, then take your turn. The
> HTs can give your team, or individual people, bonus points for things they notice. Every
> bonus has a name, so you know what it was for.
>
> HTs can also take points away for rules explained before the round. Those have a name and
> an amount too, so you can see what changed.
>
> At the end of each round, watch the big screen reveal the awards and the new scores. The
> team with the most points wins, and we celebrate individual contributions too.

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
| 00:00–05:00 | Join, explain, short demonstration | — | — | — | — |
| 05:00–11:00 | Faith Discovery | 1:30 | 4 × 0:45 = 3:00 | 1:00 | 0:30 |
| 11:00–19:00 | Dance | 2:00 | 4 × 1:00 = 4:00 | 1:00 | 1:00 |
| 19:00–27:00 | Prayer / Sacred Song | 2:00 | 4 × 1:00 = 4:00 | 1:00 | 1:00 |
| 27:00–39:00 | Bible Skit | 4:00 | 4 × 1:30 = 6:00 | 1:00 | 1:00 |
| 39:00–45:00 | Team Cheer | 2:00 | 4 × 0:30 = 2:00 | 1:00 | 1:00 |
| 45:00–48:00 | Final standings and recognition | — | — | — | Winners, individual recognition, a short reflection |
| 48:00–50:00 | Buffer and closing | — | — | — | Absorbs earlier delays |

All teams prepare at once. The first team to perform rotates each round so no team always
waits least. Waiting teams watch and encourage; they do not vote on phones.

**Estimate formula** (the setup screen recalculates it whenever teams or allowances change):

```
total = opening + Σ rounds [ prep + teams × (turn + transition) + reviewAndReveal ] + finale + buffer
```

At the sample allowances each extra team adds **6:00** (4:45 of performing plus five 0:15
transitions). Five teams estimate 56:00; six, 62:00.

Rules for the estimate:

- Keep **50 minutes** as the target and show any overrun plainly ("Estimated 56:00 · 6:00
  over the 50:00 target").
- Every allowance (prep, turn, transition, review and reveal) is editable before the event.
- Never shorten an allowance silently once it is announced, and never block creating a team
  to make the estimate fit. If the shortest workable turns still overrun, the host changes
  the format or the duration. Parallel stages with more HTs are a possible future mode.
- Keep all five subjects by default; the host can skip a round explicitly when needed.

**Timers:** the host sees the overall event clock and the current phase timer, with Start,
Pause, Resume, Add 30 Seconds, End Preparation and Next Team. A timer reaching zero
**prompts** the host; it never publishes scores or cuts off a prayer. A time change applies
to the whole round, never to one team.

### Any Number of Teams

- Teams are a dynamic collection with stable IDs. Joining, judging, scoring, the performance
  queue, results and exports never assume four.
- Player capacity per team is optional.
- Searchable team lists on phones and in the host console; standings that page or scroll;
  a generated performance queue; a reveal that pages as awards grow. The full published
  history is always kept.
- Team colors may repeat once the palette runs out; names and emblems keep teams distinct.
  The palette's size is never a team limit.
- The host may add a team during play with a starting score of zero. It joins the current
  round if performances are still open, otherwise the next round. Completion points are
  never awarded retroactively.
- Test fixtures of 1, 4, 12 and 100 teams. Those are test sizes, not limits. Measure real
  device and service capacity separately; never promise unlimited connections.

## Lobby and Roles

The host creates the lobby, names the teams, chooses colors, emblems and optional patron
names, sets capacities and opens joining. The display shows a short code and a QR code.
Players enter a display name and pick a team. No account, email or birth date.

**Joining as a Helper** leaves a participant without a team and grants nothing. The host
picks a joined participant and chooses **Make Co-GM**; revoking is **Remove Co-GM Access**
(no wording that suggests an official HT appointment or dismissal).

| Capability | Host | Co-GM | Player / Captain | Display |
| --- | --- | --- | --- | --- |
| Configure teams and event | Yes | View | No | No |
| Grant or revoke co-GM access | Yes | No | No | No |
| Transfer the host role | Yes | Accept when nominated | No | No |
| Run timers, phases and performance order | Yes | View | View public state | View public state |
| Add team or individual modifiers | Yes | Yes | No | No |
| Edit or remove own unpublished modifiers | Yes | Yes, while judging is open | No | No |
| Edit or remove another GM's modifiers | Yes | No | No | No |
| See the private judging queue and its authors | Yes | Yes | No | No |
| Review and publish a round | Yes | Mark own judging Ready | No | No |
| Correct a published score | Yes, with a reason | No | No | No |
| See published awards and standings | Yes | Yes | Yes | Yes |

- **Captains** coordinate and may press Ready. Captain status grants no scoring, moderation
  or timer powers.
- **Promoting a team member:** explain that they move to the helper roster and leave the
  competition while judging. Their score history stays, but active judges are not eligible
  for individual winner places. On revocation they become an unassigned player and the host
  can put them back on a team. Awards they submitted stay for the host to review.
- **Team switching** by players locks when the game starts. The host can admit late arrivals
  and correct assignments. Points already earned never move between teams.
- **Youth without phones:** the host can enter them on the roster; they qualify for
  individual awards like everyone else. The game never requires a device per person.
- **One host, always.** A nominated co-GM must accept a transfer; until then the original
  host keeps control, and afterwards becomes a co-GM. A private recovery credential shown at
  setup recovers a lost host device. **A lobby code alone never grants host or GM access.**

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

Individuals earn points only from **awards aimed at them**. Team completion and team bonuses
are not copied onto members, and player awards do not add to the team total. The two
standings mean different things and nothing is counted twice.

Examples: "Invited Someone In +25", "Clear Narration +25", "Helped Another Team +50". Several
recipients can be chosen at once; the form then says **+25 Each**, lists the names and shows
the combined amount. The same goes for one adjustment applied to several teams.

- The review screen flags teams whose members have no individual recognition yet. It never
  invents awards.
- Never award points for owning a phone, pressing Ready, being captain or being loudest.
- During the game: team standings for everyone; each player sees their own points.
- At the end: the leading individuals and each player's own total; the host can see the full
  individual ranking.
- Ties share a place, the winning place included. No unannounced tiebreakers, and no promise
  that the final cheer can close any gap.

### Why This Balance Fits

This is a facilitated performance game. Fairness comes from equal opportunity, consistent
observation and understandable awards; custom scores give HTs flexibility but can't make
judging objective. So award reasons stay visible and the host's cross-team review stays fast.

Before joining opens, the HTs agree on three observable areas: **teamwork**, **preparation or
communication**, and **creativity or understanding of the prompt**. In the prayer round they
recognize preparation and inclusive participation, never sincerity, eloquence or volume.
These are facilitation guidelines, not preset modifiers or formulas. Equal bases, agreed
bonus ranges and rotating turn order keep it consistent. No surprise last-place gift or
double-score finale: both make earlier effort feel arbitrary. The cheer is the celebratory
finish even when the leader can't be caught.

## Judging, Review and Publication

### Adding a Modifier

The GMs' most common action takes a few taps: pick a recipient, type a reason, enter the
amount, save. The round and the recipient stay visible throughout.

| Field | Behavior |
| --- | --- |
| Recipient Type | Team or Individual |
| Recipients | One or more, named; never everyone silently |
| Name | Required, either language, up to 60 characters |
| Translation | Optional second-language text, up to 80 characters |
| Points | Required signed whole number (`+50`, `-25`, `0`) |
| Private Note | Optional, for the other HTs; never public |
| Round | The current round, fixed for this award |
| Author | Recorded from the signed-in GM |

- Reject blank names, fractions, NaN, infinity, and values or totals outside the safe integer
  range. Zero is allowed, shown as **Recognition · 0 Points**.
- No low hard cap. An adjustment larger (in absolute value) than the round's completion
  points is flagged for review, never changed.
- All GMs see a live shared queue: author, recipient, amount, save state and projected totals.
  Players and the display never receive drafts.
- **Duplicate judgment:** the same normalized name for the same recipient in the same round
  warns; a GM can keep it anyway with a reason (repeated recognition can be intentional).
- **Duplicate delivery:** a network retry of the same submission never creates a second award.
  These two are separate mechanisms.
- **Templates and recent awards:** Save as Template, plus a shared list of recent awards.
  Using one fills an editable draft; editing a template never changes history.

### Review and Publication

1. During performances, the host and co-GMs add and revise adjustments. Co-GMs may mark their
   judging Ready; any later edit clears it.
2. The host chooses **Review Round**. Co-GM editing locks; accepted entries stay; an unsent or
   rejected entry shows as unsaved. No automatic deadline.
3. The host compares teams, checks completion statuses, duplicates and large values, and edits
   or removes entries. Judges who aren't Ready are named.
4. **Reopen Judging** goes back to editing. Otherwise **Publish and Reveal** closes any
   unfinished judging explicitly.
5. The server saves one immutable round result (completion points and every accepted
   adjustment) and starts the reveal. Every device shows this same result.
6. Standings follow the reveal. The host starts the next round when the room is ready;
   preparation never starts by itself during applause.

**Corrections:** a published round is never edited silently or awarded twice. The host adds
a named correction with a public reason (pointing at the original entry where there is one).
It adds or subtracts the difference without re-applying completion points, is published
explicitly, and updates every device. History keeps both. The MVP needs correction amounts,
not a retroactive editor.

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
  appears; none is dropped to fit the time. Host review shows the estimated reveal length.
- **Host controls:** Pause Reveal, Next Banner, Skip to Results. Skipping an animation never
  skips scoring; replaying a banner never adds points. The reveal keeps a shared position so
  a reconnecting screen picks up where the room is.
- **Signs, not just colors:** bonuses get the flame's warm accent and a modest fire pulse;
  deductions and corrections get neutral stone styling and an explicit minus sign:
  **−25 Team Points**, **−25 Individual Points**.
- **Sound:** opt-in, started only after a user gesture, and silenced for the prayer round by
  default.

## UI/UX

### Principles

1. **Phones down, eyes up.** Every phone screen's job is to get the player back to their team.
   After joining, the player screen says so outright.
2. **One obvious next action.** The host console always shows the single next step as its
   biggest button (Start Preparation, Next Team, Review Round, Publish and Reveal, Start Next
   Round). Everything else is secondary.
3. **The display is a stage, not a dashboard.** One thing at a time, readable from the back of
   the room: the challenge, the performing team and the time left. Scores are for the reveal
   and the standings.
4. **Private stays private, by construction.** Nothing private is ever sent to the display or
   players (enforced by the server, not hidden by CSS).
5. **Points always show their sign and their reason.** No bare numbers, no color-only meaning.
6. **The spectacle never blocks the game.** Scoring, timers and the network never wait on the
   flame, a model loading or an animation finishing. Without WebGL, everything still works.

### Visual Language

Inherit the portfolio, then tune it for a room and a projector.

| Element | Portfolio | In the game |
| --- | --- | --- |
| Background | `--c-void` #07070b, `--c-shadow` #15131d | Same: the scene's night. Panels use the site's `--panel-bg` and 1 px `--line` frame |
| Text | `--c-bone` #e9e3d2; `--accent-hi` for colored text | Same. Body and numbers always in bone or `--accent-hi`, never in a team color |
| Accent | Follows the flame (`theme.js`) | Gilded Flame for the lobby and branding; the round's flame during play (below) |
| Team colors | — | A swatch, the emblem and the panel edge only, never text. Generated with enough separation from the void and from each other; repeats allowed once the set runs out |
| Emblems | — | A small set of pixel-art shapes (shield, star, flame, cross, dove, crown, anchor, lamp…) so a team is never identified by color alone |
| Panels | `.panel`, dithered entrance (`ui/dither.js`) | Display: round cards and banners use the panel and its dither-in. Phones: plain panels, no entrance animation |
| Type | Inter (body), Cinzel (names), Pixelify Sans (pixel labels) | Inter for all Vietnamese, instructions and scores. Cinzel for English titles and English team names. Pixelify Sans for short labels and big numbers (digits and signs only). See [the font caveat](#verified-caveat-the-display-fonts-have-no-vietnamese-subset) |

**Type scale.** Display (1080p projector): round title 72–96 px, timer 160 px+, team name
48–64 px, banner name 56 px, body 28 px minimum. Phones: body 16 px minimum (never smaller,
so iOS doesn't zoom), primary buttons 48 px tall or more, amount fields 20 px.

**Contrast.** Text ≥ 4.5:1 on its background (7:1 for display body text, which is read from
far away on washed-out projectors). Test the display on an actual projector in a lit room;
the scene's darks crush there, so banners sit on an opaque panel, not straight on the 3D.

### Round Moods and Scene Cues

A presentation adapter (`src/larp/stage.js`) maps game events to scene calls. Game state never
waits for it, and every call is optional: a missing method or scene does nothing.

| Moment | Flame (suggested) | Scene cue | Knight |
| --- | --- | --- | --- |
| Lobby | `gilded` | Gentle idle; `stoke()` as each team fills its first seat | `wave` now and then |
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

**Reduced motion** (the OS setting, or a host toggle on the display): build the scene with
`createBonfire(…, { reducedMotion: true })`, no rings, flashes, shake or gestures, and banners
that cross-fade instead of sliding. Same information, same timing.

**No WebGL or a failed load:** the display shows a static, dimmed still of the bonfire (the
build already makes one for the site's social preview, `og/home.jpg`, from
`assets/source/bonfire-preview.png`) behind the same HTML panels. Nothing else changes.

### Shared Display

A read-only page (`/larp/#/display`) opened on the projector laptop or any browser. It joins
with a **display link** the host generates (its own read-only credential, not the lobby
code), so it can run on a separate machine. On the host's own laptop, **Open Display Window**
opens it in a new window to drag onto the projector and make full screen
(`toggleFullscreen()`). It is a page of its own, not a streamed canvas like Bonfire Live's
output window, so it survives the host console reloading.

Layout: the bonfire fills the screen; HTML panels sit over it in fixed zones, leaving the
fire visible in the middle third.

```
LOBBY                                         PERFORMING
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ LỬA TRẠI NGHĨA SĨ                    │      │ VÒNG 4 · HOẠT CẢNH KINH THÁNH        │
│ Nghĩa Sĩ Campfire          ┌──────┐  │      │ Round 4 · Bible Skit                 │
│                            │  QR  │  │      │                                      │
│        (bonfire)           └──────┘  │      │        (bonfire)          ◆ ĐỘI      │
│                          Mã Phòng    │      │                             PHAOLÔ   │
│                          Lobby Code  │      │                          Team Paul   │
│                          K7Q4        │      │                                      │
│ ◆ Phaolô 6  ★ Giuse 5  ✚ Maria 4 …   │      │ Next: ★ Giuse          ███ 1:12      │
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
- **Timer:** digits in Pixelify Sans; the last 10 seconds turn the ring amber, never red and
  never flashing. At zero it reads "Time · Hết Giờ" and holds; it does not buzz or cut off.
  In the prayer round the timer is small and never animates.
- **Standings:** shared places shown as equal numbers ("2, 2, 4"). Movement arrows only after
  round 1. With many teams, page automatically (eight rows a page at 1080p, eight seconds
  each), the current page shown. Never show a list of zero scores at the end; individuals
  show only the leaders.
- **Team admitted mid-game:** a quiet "New team · Đội mới" chip, never a banner.
- **Never shown:** private notes, which GM gave what, credentials, drafts, host controls,
  connection internals.
- **Offline:** a small "Reconnecting…" chip in a corner; the last published state stays up.

### Host Console

The host's laptop, private (`/larp/#/host`). Wide layout, three columns at ≥ 1200 px,
stacked tabs below. It is a working tool: clarity over fantasy chrome, while still using the
site's panels, type and accent.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ K7Q4 · Round 4 Bible Skit · PERFORMING        Event 31:20 / 50:00 (est. +0:40)  ●  │
│                                                        [ Next Team: ★ Giuse ▸ ]    │
├───────────────────────┬──────────────────────────────────┬─────────────────────────┤
│ QUEUE                 │ JUDGING                          │ PROJECTED               │
│ ✓ ◆ Phaolô  Complete ▾│ [Team ▾] [◆ Phaolô ▾]           │ ◆ Phaolô  500 +100 = 600│
│ ▸ ★ Giuse   —        ▾│ Name  [Cùng Nhau Tỏa Sáng     ]  │ ★ Giuse     —           │
│   ✚ Maria   —        ▾│ Trans [Shine Together         ]  │ ✚ Maria     —           │
│   ⚓ Phêrô   —        ▾│ Points [ +75 ]  [ Add ]          │ ⚓ Phêrô    —           │
│                       │                                  │                         │
│ Turn 1:12  [Pause]    │ SHARED QUEUE                     │ No individual awards    │
│ [+30 s]               │ +75 Phaolô · Shine Together · You│ yet: Giuse, Maria       │
│                       │ +50 Phaolô · Creativity · Anh B. │                         │
│                       │ −25 Phaolô · Over Time · You     │ Reveal est. 0:42        │
├───────────────────────┴──────────────────────────────────┴─────────────────────────┤
│ Tabs: Run · Participants · Review · History · Setup          [Preview Display]     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar:** lobby code, round and phase, event clock against the target (with the live
  estimate), connection dot, and the **one next action** as the biggest button. The next
  action's label always names what it will do ("Publish and Reveal Round 4").
- **Completion status** sits on each team in the queue (Complete / Passed / Absent). Unset
  shows as an outlined "—" and blocks publishing; the Publish button says why ("2 teams need
  a status").
- **Add Modifier sits next to the team list**, and picking a team in the queue selects it as
  the recipient.
- **Panels:** Run (above), **Participants** (roster, helpers, Make Co-GM, host transfer,
  late admissions, phone-less members), **Review** (side-by-side teams, flags for duplicates,
  large values, teams without individual recognition, judges not Ready, reveal length),
  **History** (published rounds, corrections), **Setup** (teams, allowances, estimate,
  language, scenery, export).
- **Preview Display** shows what the projector shows, in a small frame, without projecting
  the console.
- **Confirmation** only for what is hard to undo: Publish and Reveal, Skip Round (when drafts
  exist), End Event, Transfer Host. Ordinary draft edits are instant and reversible (Undo on
  delete for a few seconds).
- **Keyboard** (listed in the `?` overlay, `keysOverlay.js`; silent while typing, `typing()`):
  `Space` pause/resume the timer, `N` next team, `T` add 30 seconds, `A` focus Add Modifier,
  `?` the list. **No single key publishes**: Publish needs its button and its confirmation.
- **Projected totals** update live as drafts change, labelled "Projected · not published".

### Co-GM Phone View

An HT's phone during performances (`/larp/#/judge`). Single column, thumb-reachable.

```
┌───────────────────────────────┐
│ R4 Bible Skit · PERFORMING  ● │
│ Now: ★ Đội Giuse   1:12       │
├───────────────────────────────┤
│ To  (Team)(Individual)        │
│ [ ★ Đội Giuse            ▾ ]  │
│ Name                          │
│ [ Sáng Tạo                 ]  │
│ Translation (optional)        │
│ [ Creativity               ]  │
│ Points                        │
│ [ − ] [   50   ] [ + ]        │
│ Note for HTs (private)        │
│ [                          ]  │
│ [        Save +50         ]   │
├───────────────────────────────┤
│ Recent: Sáng Tạo +50 · Quá    │
│ Giờ −25 · Tinh Thần +25 …     │
├───────────────────────────────┤
│ SHARED QUEUE (7)          ▾   │
│ ✓ Saved  +50 Giuse Creativity │
│ ⟳ Saving −25 Giuse Over Time  │
├───────────────────────────────┤
│ [ My Judging Is Ready ]       │
└───────────────────────────────┘
```

- **Round and recipient always visible** at the top; the recipient defaults to the team now
  performing (pre-selected, never silently "everyone").
- **Signed amounts made easy.** Mobile numeric keypads often lack a minus key, so the field
  has `−` / `+` sign toggles beside it and accepts typed `-` and `−`. The Save button repeats
  the signed value ("Save −25", "Save +25 Each · 3 people").
- **Recent awards and templates** are one tap: they fill the form, never submit it.
- **Save states** are distinct and worded: **Saving…**, **Saved**, **Failed · Retry**,
  **Locked for Review**. Offline shows "Not sent · will retry" and never a checkmark.
- **After Review Round**, the form locks with a banner saying why, and unsent drafts stay
  visible and marked unsaved.
- **Duplicate warning** inline under the name: "Anh B. already gave Đội Giuse 'Creativity'
  this round · Add anyway?" with a reason field.

### Player Phone View

Join → choose team → "Put your phone away" → prompt and timer when they glance → published
awards and standings. Nothing else.

```
JOIN                         TEAM                         DURING PLAY
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ LỬA TRẠI NGHĨA SĨ   │      │ Choose Your Team    │      │ ◆ Đội Phaolô        │
│ Mã Phòng · Code     │      │ Chọn Đội            │      │ Vòng 2 · Vũ Điệu    │
│ [ K 7 Q 4 ]         │      │ [Search… ]          │      │ Dance · Prep 1:45   │
│ Tên · Your Name     │      │ ◆ Phaolô   5/6  [▸] │      │                     │
│ [ Mai             ] │      │ ★ Giuse    6/6 Full │      │ Phones down! Work   │
│                     │      │ ✚ Maria    3/6  [▸] │      │ with your team. 🔥  │
│ [      Join      ]  │      │ ⚓ Phêrô    4/6  [▸] │      │                     │
│ Joining as a Helper │      │                     │      │ Your points: 25     │
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
```

- **Join** accepts the code from the QR link pre-filled; codes avoid look-alike characters
  (no 0/O, 1/I/L) and are case-insensitive.
- **Names:** a plain text field, up to 24 characters, Vietnamese accents welcome; duplicate
  names in a team get a gentle suffix prompt ("Mai" → "Mai T.").
- **Captains** see one extra button, **Ready**; the host can start without it.
- **Your points** shows only the player's own total, never others' individual scores.
- **End of game:** the team's place, the player's own total and the leading individuals;
  no wall of low or zero scores.
- **Wake lock** is never requested: the phone is meant to sleep.

### States Every Screen Handles

| State | What the person sees |
| --- | --- |
| Connecting / reconnecting | A small chip; the last known state stays visible and controls that need the server are disabled |
| Offline host | Publish disabled with the reason; drafts kept locally |
| Stale draft after publish | "This round was published. Your draft wasn't included" with Copy and Discard |
| Lobby code wrong or expired | Plain message, the field kept, no hint whether a lobby exists |
| Team full | Shown in the list; not selectable |
| Removed co-GM access | Controls disappear on the next update; any action in flight is refused with a clear message |
| Host transfer pending | The nominee sees Accept / Decline; the host sees "Waiting for …" |
| Event finished | Final standings and, for the host, Export Results and the retention notice |

### Language and Accessibility

- **Modes:** Bilingual (Vietnamese title, English subtitle; default), English first,
  Vietnamese only. The host picks the display's mode; each phone can switch its own.
- **Strings** come from an explicit translation map (`src/larp/strings.js`), never generated
  at runtime. Custom award names are shown as entered, with the HT's optional translation.
- **Title Case** for English labels (`titleCase()`), sentence-case hints of 160 characters or
  fewer, per the repo's rule. Vietnamese is written out in its correct case and diacritics.
- **Fonts:** see [the caveat](#verified-caveat-the-display-fonts-have-no-vietnamese-subset).
  Check Vietnamese line height: stacked marks (ấ, ổ, ự) need about 1.35 line height in Inter
  to avoid clipping.
- **Keyboard and focus:** every control reachable by keyboard with a visible focus ring;
  dialogs trap focus and return it (`focus.js`, `restMenu.js`).
- **Screen readers:** the timer is not a live region (it would chatter); phase changes and
  saved/failed states are announced politely.
- **Zoom:** layouts work at 200% text zoom and down to 320 px wide.
- **Motion:** honor `prefers-reduced-motion` everywhere; the display also has its own toggle.
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
| Ban Giám Khảo | Judging Team | Host and assisting GMs as a group |
| Đội | Team | Competition group |
| Đội Trưởng | Team Captain | Youth coordination role |
| Mã Phòng | Lobby Code | Joining |
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

Use the functional labels **Host** and **Co-GM** beside the Vietnamese in permission
controls. Don't call the host Trại Trưởng unless the event's actual leader chooses that
title. Making someone a co-GM grants software access only.

## Architecture

### Files

| Path | What it is |
| --- | --- |
| `larp/index.html` | The page (one entry for all four screens, routed by hash like the site: `#/display`, `#/host`, `#/judge`, `#/play`) |
| `src/larp/rules.js` | Pure game rules: configuration, scoring, permissions, phase transitions, validation. No DOM, no three.js, no network |
| `src/larp/state.js` | The command reducer over the domain records, with revisions and idempotency |
| `src/larp/transport.js` | One interface for both a local dev transport and the hosted WebSocket service |
| `src/larp/strings.js` | The Vietnamese/English string map |
| `src/larp/display.js`, `host.js`, `judge.js`, `play.js` | The four screens (HTML views over the public or private projection) |
| `src/larp/stage.js` | The presentation adapter: game events → scene cues, all optional |
| `src/larp/larp.css` | The game's styles over `src/tokens.css` |
| `worker/larp/` (or similar) | The Cloudflare Worker and Durable Object, separate from `admin/worker.js` |
| `test/larp*.test.mjs`, `e2e/larp.spec.mjs` | Unit tests for rules and state; a browser spec with host, co-GM, player and display pages |

Build and site hygiene:

- Add `larp: resolve(import.meta.dirname, 'larp/index.html')` to `vite.config.js`'s inputs,
  keeping the `BASE` handling.
- Add `src/larp/` to `firstLoadGuard`'s `SHOW_ONLY` pattern so the portfolio's first load can
  never carry game code.
- Keep `/larp/` out of `sitemap.xml` and add `Disallow: /larp/` to `robots.txt`; mark the page
  `noindex`. Lobbies are private; nothing about them is public.
- Load three.js and the scene **only on the display**, lazily (`import()`); phones never load
  them. Dispose the scene on leaving.
- The game's local storage uses its own key prefix (`larp.`) and never touches Bonfire Live,
  Painter or site settings. No game data goes in `src/content.json`.
- No model rebuild for the MVP; the knight's existing gestures only, after visual review.

### Multiplayer

Real phones need shared, authoritative lobby state; a local-only mock is useful for visual
review but does not count as multiplayer.

Recommended: a separate **Cloudflare Worker with one Durable Object per lobby** and
WebSockets for updates (the repo already deploys a Worker for the admin, which stays
separate). [Cloudflare Durable Objects overview](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)
The transport interface lets a local dev server and the hosted service run the same
commands, so reviewing a local prototype needs no deployment or paid setup.

**Phases.** Lobby → Running → Finished. Within each round:

`Briefing → Preparation → Performances → Review → Reveal → Results`

- Only the host advances phases, and the server validates every transition.
- Timers can pause within a phase. Review can return to Performances (judging reopened).
  Results advances to the next Briefing.
- A skipped round records Skipped, discards its unpublished awards and counts zero; it can't
  be partly counted. Confirm when drafts exist.
- Publication locks the result; revisiting Results or reconnecting is never a new scoring
  event.

### Domain Records

| Record | Required information |
| --- | --- |
| Lobby | ID, join code, schema version, host ID, configuration, phase, revision |
| Participant | Stable ID, display name, role, team ID or none, captain flag, eligibility |
| Team | Stable ID, name, color, emblem, optional capacity, admission round |
| Round | ID, category, prompt, base points, durations, order, completion statuses |
| Adjustment | ID, round ID, recipient type and ID, name, translation, signed points, author, status, batch ID |
| Published Result | Unique round ID, frozen completion awards and adjustments, totals, publication time |
| Correction | ID, target, signed difference, public reason, author, original reference if any |
| Timer | Running or paused, server deadline or remaining time |
| Audit Entry | Actor, command ID, action, timestamp, affected IDs |

- Private notes live apart from the public projection.
- A batch award is one record per recipient sharing a batch ID. A published player award
  snapshots the player's team at that moment.
- **Scores are derived** from published results and corrections, never kept as separate
  totals that could drift. One publication per round; unique command IDs; server revisions
  to detect stale edits. A rejected draft is kept locally for the HT, and no accepted edit is
  ever silently overwritten.

### Security, Reconnects and Retention

- Every participant session is authenticated and every mutation authorized on the server.
  Revoked access applies on the next request, from any tab showing old controls.
- The display and players receive the public projection only (plus each player's own
  detail). Names and modifiers are plain text, never HTML.
- Reconnecting resumes the same participant identity and fetches current state without
  duplicating members or replaying awards. Uncertain commands retry with their original IDs.
- Accepted commands are persisted before they are acknowledged; timer deadlines and paused
  time are persisted so a refresh never restarts a countdown.
- A host disconnect never promotes anyone; the host resumes through their session, the
  recovery credential or a completed transfer.
- **Export:** host-only results with teams, display names, published scores and award
  reasons; no credentials or private notes.
- **Retention:** 24 hours after the event finishes by default, disclosed to the host with
  export available before expiry. A product default, not a legal requirement.

## Acceptance Criteria

Write the meaningful tests for rules, permissions and multiplayer before implementing each
stage. Use focused visual checks for presentation.

### Rules, Permissions and Multiplayer

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | A host creates any number of teams and players join by code | Players choose host-created teams; capacities are respected |
| A02 | A helper joins without a team | No GM powers until the host grants them |
| A03 | The host grants then revokes GM access | Allowed actions update immediately; the server rejects stale permissions |
| A04 | Two HTs add different awards at once | Both remain; neither overwrites the other |
| A05 | A saved submission is retried after a lost response | It exists exactly once |
| A06 | A second HT uses the same name for the same recipient | They see a duplicate warning and can keep both with a reason |
| A07 | A player or display inspects incoming data during judging | Drafts, private notes and credentials are absent |
| A08 | +75, +50 and −25 on a completed 500-point skit | Preview and published team score both equal 600 |
| A09 | Mai also receives +25 individually | Mai gains 25; the team's round score stays 600 |
| A10 | Three recipients get +25 each | The preview names all three and says +25 each; each gets one award |
| A11 | Review starts while an HT has an unsent draft | Editing locks, the draft shows unsaved, the host can reopen judging |
| A12 | One team's completion status is unset | Publishing is blocked until it is set |
| A13 | Publish is double-clicked or retried | One immutable round result, one set of points |
| A14 | The host skips or replays banners | Scores unchanged; all awards remain in history |
| A15 | A published +75 should have been +50 | A −25 correction changes the total once; both records remain |
| A16 | A host refreshes or a player reconnects | Identity, published scores, phase and timer recover without duplication |
| A17 | A player tries to become host with the lobby code | The server rejects it |
| A18 | A host transfer is accepted | Exactly one host; the old host has co-GM permissions |
| A19 | Teams or individuals tie | They share their place |
| A20 | Teams are added beyond the sample schedule | Creation stays available; the estimate grows and shows the overrun |
| A21 | WebGL fails, reduced motion is on, or a phone is narrow | Joining, controls, scores and award text stay usable |
| A22 | A custom name contains markup or Vietnamese accents | It renders as safe, readable text with correct diacritics |
| A23 | A team passes, a round is skipped, or a deduction exceeds the base | Scores follow the zero-completion, skipped-round and signed-arithmetic rules |
| A24 | A co-GM tries to edit another GM's entry or publish | The server rejects both |
| A25 | An offline or stale-round draft arrives after publication | It is rejected clearly; the published result is unchanged |
| A26 | Fixtures of 1, 4, 12 and 100 teams | Joining, queues, judging, paging, scoring and exports include every team |
| A27 | A team or individual gets a custom −25 | GM preview, published total, negative banner and history agree |
| A28 | A team is added after a round was published | It starts at zero; completed rounds are unchanged |

### UI/UX

| ID | Scenario | Required result |
| --- | --- | --- |
| U01 | Vietnamese titles and team names on the display | No mid-word font fallback: a string the display font can't fully cover is set entirely in Inter |
| U02 | The display from 6 m on a 1080p projector | Round title, team name, timer and banner text are readable (checked in person at rehearsal) |
| U03 | A negative modifier on any surface | A minus sign and the word Points appear; meaning never depends on color |
| U04 | The host console in every phase | Exactly one primary next-action button, labelled with what it does |
| U05 | A co-GM enters −25 on a phone keypad without a minus key | The sign toggle produces −25 and the Save button reads "Save −25" |
| U06 | A co-GM loses connection while saving | The state reads Failed or Not sent, never Saved |
| U07 | The prayer round on the display | No rings, flashes, knight gestures or sound; the timer doesn't animate |
| U08 | The portfolio's first load after the game is added | No `src/larp/` module in it (`firstLoadGuard` stays quiet) |
| U09 | 200% text zoom; 320 px wide; keyboard only | Every control usable, focus visible, nothing clipped |
| U10 | The final standings with many players | Leading individuals only on the display; each phone shows its own total |

The four-team pilot should run all five rounds within 50 minutes, reveals included. Larger
pilots validate their adjusted schedule against the same target. Watch whether youth
understand their award reasons, quieter members find useful roles, and HTs can enter
awards without missing the performances.

## Implementation Sequence

1. **Rules and state:** configuration, scoring, permissions, phase transitions, timers and
   idempotent publication, with the A-series tests on deterministic fixtures.
2. **Working multiplayer:** joining, teams, co-GM appointment, shared judging, host review,
   publication, standings, reconnect and recovery. Verified with separate host, co-GM, player
   and display sessions.
3. **Event presentation:** the display's scene through the adapter, bilingual round cards,
   award banners, the phone views, reduced motion and the static fallback; the U-series checks.
4. **Rehearsal:** run the sample schedule at real speed on a real projector, exercise
   corrections and reconnects, and tune friction.

MVP done means: unrestricted team creation, positive and negative modifiers, team and
individual scoring, real multiplayer and the host/co-GM workflow. If percentage or
multiplier modifiers are requested later, define stacking order, rounding and correction
semantics first; don't infer them from the word "modifier".

Working in this repo: read `CLAUDE.md`, `AGENTS.md` (if present) and `CONTRIBUTING.md`
first; the owner's instructions win where they differ. Preserve unrelated changes and saved
formats. Use `npm run test:fast` while working and `npm run check` before every commit; run
focused browser specs (`npm run e2e -- larp`), not the whole suite. Check visible effects at
real speed. Pushes, pull requests, tags and deployment need the owner's say-so; this
document authorizes none of them, nor any change to the portfolio's published content.

## Prompt to Use with Claude Code

Read `docs/design/nghia-si-campfire.md` as the product design for a new Nghĩa Sĩ campfire game
in this repository, after the repository's own instructions. Treat Confirmed Requirements as
required behavior and Recommended Defaults as the starting configuration. Preserve the five
fixed subjects, the 50-minute target with team-count-aware estimates, unrestricted team
creation, custom GM-named positive and negative adjustments, host-appointed co-GMs,
end-of-round banners and separate team and individual standings. Do not add an opening
call-and-response.

Inspect only the relevant modules (confirm the scene API and font coverage this design
cites), then give a concise implementation plan mapped to the acceptance criteria. Name real
blockers; use the documented defaults for routine choices. Write the meaningful tests first
and implement in the listed stages. Keep game state independent of the Bonfire
presentation, and demonstrate the full flow with separate host, co-GM, player and display
sessions before calling multiplayer done.

Use the existing Bonfire assets, tokens and UI pieces with the plain JavaScript stack. Keep
player screens simple and the spectacle on the shared display. Do not add omitted
brainstorming features or rewrite existing apps. Finish each stage with the relevant checks
and a short report of what works, what was verified and what remains. Do not push, open a
pull request or deploy unless I explicitly authorize it.
