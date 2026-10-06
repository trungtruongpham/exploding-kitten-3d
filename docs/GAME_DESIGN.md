# Mèo Bom (Fuse Cats): Game Design Document

**Status:** Draft v0.2 · **Date:** 2026-10-06 · **Main language:** Vietnamese
**One-liner:** A 3D, browser-based, online card game for 2 to 5 players in which everyone draws from a shared deck hiding lit-fuse cats, and the last player not blown up wins.

> **Naming & IP note.** The core mechanic is inspired by *Exploding Kittens*. Game rules can't be copyrighted, but names, card text, and artwork can be, and "Exploding Kittens" is a trademark. This project uses its own title (**Mèo Bom**, English working name *Fuse Cats*), its own card names, and original art. Nothing from the commercial game's art, card text, or branding goes into the repo.

---

## 1. Goals and non-goals

**Goals**
- Fast, readable, funny rounds: 8 to 15 minutes for 5 players.
- A real 3D table that adds drama (the reveal, the explosion, the defuse) without slowing play.
- Play with friends by sharing a room link; no install, works on desktop and mobile browsers.
- 2 to 5 players per room, with bots to fill empty seats.

**Non-goals (v1)**
- Expansions, ranked matchmaking, accounts with progression, monetization.
- More than 5 players (the deck and table are tuned for 5).
- Native mobile apps.

---

## 2. Core rules

### 2.1 Objective
Players take turns drawing from a shared deck. Drawing a **Fuse Cat** eliminates you unless you play a **Snip** card. The last player left wins.

### 2.2 Card set (base deck, 56 cards)

Players see the Vietnamese name; the English name is used in code (`fuse`, `snip`, …) and for the English fallback.

| Card (VI / EN) | Count | Effect | Original inspiration |
|---|---|---|---|
| **Mèo Bom** / Fuse Cat | 4 (uses players − 1) | Drawn → you explode and are out, unless you play Snip. | Exploding Kitten |
| **Cắt Ngòi** / Snip | 6 | Cancel a Fuse Cat you just drew; secretly re-insert the Fuse Cat anywhere in the deck. | Defuse |
| **Khè!** / Hiss | 5 | Cancel any action card (not Fuse Cat or Snip). Can be played at any time, even out of turn. A Hiss can be Hissed. | Nope |
| **Vồ Mồi** / Pounce | 4 | End your turn without drawing; the next player takes 2 turns. Stacks: if the target plays Pounce, the next player takes the remaining turns + 2. | Attack |
| **Ngủ Trưa** / Catnap | 4 | End one turn without drawing. | Skip |
| **Mua Chuộc** / Bribe | 4 | Pick a player; they choose a card from their hand to give you. | Favor |
| **Xáo Bài** / Scramble | 4 | Shuffle the draw pile. | Shuffle |
| **Nhìn Trộm** / Peek | 5 | Privately view the top 3 cards of the draw pile. | See the Future |
| **Mèo Hẻm** / Alley Cats (5 breeds × 4) | 20 | No effect alone. Play a pair of the same breed to steal a random card from a chosen player. Play three of a kind to name a card and take it from a player if they have it. | Cat cards |

Alley Cat breeds (original): **Mèo Bánh Mì** (Toast Cat), **Mèo Disco** (Disco Cat), **Mèo Khoai Tây** (Potato Cat), **Mèo Phù Thủy** (Wizard Cat), **Mèo Ninja** (Ninja Loaf).

### 2.3 Setup (scales to 2 to 5 players)
1. Remove all Fuse Cats and Snips from the deck.
2. Deal each player 7 cards plus 1 Snip (8 cards in hand).
3. Shuffle the remaining Snips back into the deck (6 − players; for 5 players, 1 goes back).
4. Shuffle in **players − 1** Fuse Cats (5 players → 4; 2 players → 1). Return extras to the box.
5. Shuffle. Pick a random first player; play goes clockwise.

Draw pile at the start (46 non-Fuse/Snip cards, 7 dealt per player):

| Players | Draw pile | Fuse Cats in it | Snips in it |
|---|---|---|---|
| 2 | 37 | 1 | 4 |
| 3 | 30 | 2 | 3 |
| 4 | 23 | 3 | 2 |
| 5 | 16 | 4 | 1 |

At 5 players a quarter of the deck is lethal, which is what makes the endgame tense. At 2 players the long, safe deck can drag; see the open question on a trimmed 2-player deck.

### 2.4 Turn flow
1. **Action phase (optional):** play any number of action cards, one at a time. Each one opens a **Hiss window** (see 2.5) before it resolves.
2. **Draw phase (mandatory unless skipped):** draw the top card. This ends your turn.
   - If it's a Fuse Cat: play Snip (choose re-insert position, hidden from others) or explode. Exploded players are out; their hand is discarded face up; their Fuse Cat stays out of the deck.
3. Pounce/Catnap end the turn without drawing (Pounce also passes turn debt).

**Hand limit:** none. **Turn timer:** 30 s action phase, auto-draw on timeout (configurable per room).

### 2.5 Hiss window (the one tricky online rule)
In the physical game, anyone can shout "Nope" at any moment. Online, every action card opens a short reaction window:
- After a card is played, all players who hold a Hiss see a **Hiss!** button for **3 seconds** (the timer resets each time a Hiss is played, to allow Hiss chains).
- To avoid leaking information, **every** player sees the countdown, whether or not they hold a Hiss.
- If the window closes, the action resolves (canceled if an odd number of Hisses were played).
- Fuse Cat and Snip can't be Hissed.

### 2.6 Elimination and win
- Exploded players become spectators with an optional "ghost cam" that can see everyone's hand (only after elimination).
- The last surviving player wins. Show a podium with elimination order.

### 2.7 Disconnects
- A disconnected player's seat is held for 60 s; their turn timers run normally (auto-draw).
- After 60 s a bot takes over the seat. The player can reclaim it on reconnect.

---

## 3. The 3D experience

### 3.1 Art direction (original)
- **Look:** soft, toy-like low-poly with chunky outlines; warm lamp-lit table in a cluttered cat café after hours. Stylized, not realistic.
- **Palette:** cream felt, walnut wood, neon accent per player seat (5 seat colors, chosen to be distinguishable with color-blind modes).
- **Cards:** thick rounded cards with a subtle bend when held. Each card type has a strong silhouette icon so it's readable at small sizes; text is secondary.
- **Players:** each seat has a customizable cat avatar (body shape, fur color, hat) sitting on a cushion around the table. Avatars react: flinch when the deck is drawn near a Fuse Cat, cheer on a Snip, blackened and fluffed-up after exploding.

### 3.2 Table layout (5 seats)
```
              Seat 3     Seat 4
         Seat 2   [ DECK ][ DISCARD ]   Seat 5
                        YOU (Seat 1)
```
- Round table, seats spaced at 72°. With fewer players, seats re-space evenly.
- The local player's camera is always at their own seat, looking slightly down across the table; their hand fans along the bottom of the screen (as a 3D fan in screen space, so it's always readable).
- Opponents' hands are shown as face-down card fans with a count badge.
- Center: draw pile (height reflects remaining cards), discard pile (top card face up), and a "turn ring" light that glides to whoever's turn it is.

### 3.3 Signature moments (where 3D earns its keep)
| Moment | Treatment |
|---|---|
| **Drawing** | Card lifts off the deck, slow flip toward the drawer's camera. A low rumble plays when the deck contains Fuse Cats (always, so it's not a tell). |
| **Fuse Cat drawn** | Time slows; the card hisses with a sparking fuse; camera pushes in; a 5 s countdown ring appears. Everyone sees it. |
| **Snip** | Wire-cutter snap, fuse goes out with a puff of smoke; the re-insert is shown as the card sliding into the deck at an unreadable blur. |
| **Explosion** | Confetti-and-soot cartoon blast, cat avatar launched comically, table shake. No gore. |
| **Hiss** | Big cat hiss SFX; the played card gets swatted back to the player by a paw. |
| **Pounce** | Cat avatar leaps toward the target seat; turn ring turns red with "×2". |
| **Peek** | Private: top 3 cards float up only for the peeker; others see the peeker's avatar holding binoculars. |

### 3.4 UI layer (2D overlay on the 3D scene)
- Turn banner and turn timer, pending-turns counter, deck count, Fuse Cats remaining.
- Hiss button (large, thumb-reachable on mobile).
- Action log (collapsible) for "who did what", so nobody misses a play.
- Emotes (5 cat emotes) and quick chat; mute per player.
- Settings: reduced motion (skips camera moves and slow-mo), color-blind seat palettes, volume, card-text size.

### 3.5 Controls
- **Desktop:** click a card to select, click again or drag to the center to play; click the deck to draw. Keyboard: 1–9 to select, Space to draw, H to Hiss.
- **Mobile:** tap to select, swipe up to play, tap the deck to draw. Portrait and landscape layouts.

---

## 4. Language

- **Vietnamese is the main language.** All UI text, card names, card descriptions, the action log and the big announcements ("KHÈ!", "CẮT!", "BÙM!") are written in Vietnamese first.
- English stays available as a secondary language in settings. All strings live in locale files (`vi.json`, `en.json`); game logic uses language-neutral card ids.
- Fonts must cover Vietnamese diacritics: **Baloo 2** for display and card titles, **Nunito** for body text (both have Vietnamese subsets on Google Fonts). Card faces are drawn from text at runtime, so translations never need new art.
- Default bot names are Vietnamese cat names: Bông, Mướp, Mun, Khói.

## 5. Online multiplayer

### 4.1 Model
- **Authoritative server.** The server holds the deck and all hands, validates every move, and runs the timers. Clients only send intents (`playCard`, `draw`, `hiss`, `chooseTarget`, `insertFuseCat`) and render the state they're given.
- **Hidden information:** each client receives a **per-player view**: own hand in full, others' hand counts only, deck count only (never order). Peek results go only to the peeker. This prevents cheating via devtools.
- **Shared rules engine:** game logic is a pure, deterministic TypeScript module (`state + action → new state + events`) used by the server and by bots, and unit tested in isolation. The client never runs authoritative logic.

### 4.2 Rooms and lobby
- Create a room → get a 5-letter code and share link (`/r/ABCDE`).
- Lobby shows seats (up to 5), avatars, ready toggles, host settings (turn timer, Hiss window, bots on/off).
- Host starts when 2+ players are ready; empty seats can be filled with bots.
- Quick Play: auto-join a public room with open seats.
- Guest play with a nickname; no account required for v1.

### 4.3 Bots
- Simple rule-based bot: plays Peek/Scramble when the risk is high, Snips to a mid-deck position, Hisses Pounces aimed at it, uses Catnap when it has seen a Fuse Cat on top. Three difficulty levels by tuning thresholds and adding "mistakes".

### 4.4 Networking details
- WebSocket transport; server tick is event-driven (no fixed tick needed for a card game).
- State sync: server sends events (for animations) plus a full per-player snapshot on join/reconnect.
- Animations are client-side and never block the server; the server waits for the Hiss window, not for animations. Clients queue events and play them back in order, catching up quickly if behind.
- Reconnect via a session token stored in `localStorage`.

---

## 6. Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One rules engine shared by server, bots, and tests. |
| Monorepo | **npm workspaces** (`apps/web`, `apps/server`, `packages/engine`) | Works with plain Node, nothing extra to install. |
| 3D rendering | **Three.js via React Three Fiber** | Mature, huge ecosystem, declarative scene graph that plays well with React UI. |
| Animation | **@react-spring/three** or GSAP | Springy card motion; timeline control for signature moments. |
| UI overlay | **React** + **Tailwind CSS** | Fast to build lobby, HUD, and settings. |
| Client state | **Zustand** | Lightweight store for server snapshots and UI state. |
| Build | **Vite** | Fast dev server and builds. |
| Multiplayer server | **Socket.IO** (Node) with our own small room manager | Rooms, invite codes, reconnection tokens and per-player views fit in ~400 lines; fewer moving parts than a framework. (Colyseus was the first idea.) |
| Persistence | None in v1 (in-memory rooms); **Redis** later for scaling rooms across instances | Keep v1 simple. |
| Assets | **Blender** → glTF (`.glb`), compressed with Draco/Meshopt; KTX2 textures | Small downloads; target under 15 MB first load. |
| Audio | **Howler.js** | Simple, reliable web audio. |
| i18n | **i18next** (Vietnamese default, English fallback) | Plain locale files with interpolation for log lines. |
| Testing | **Vitest** (engine), **Playwright** (lobby and a full bot game in the browser) | Engine correctness is the main risk. |
| Hosting | Static web on **Vercel/Netlify/Cloudflare Pages**; server on **Fly.io** or **Railway** | Cheap, WebSocket-friendly. |

**Performance targets:** 60 fps on a mid-range laptop, 30+ fps on a 3-year-old phone; under 200 draw calls; reduced-quality preset auto-selected on low-end devices.

---

## 7. Proposed repository layout

```
apps/
  web/        React + R3F client (scene, HUD, lobby)
  server/     Socket.IO server (rooms, timers, views)
packages/
  engine/     Pure TS rules engine (state, actions, events, bots)
  assets/     glTF models, textures, audio (source .blend files in LFS)
docs/
  GAME_DESIGN.md
```

---

## 8. Milestones

1. **Rules engine** – full rules, Hiss chains, Pounce stacking, 2–5 player setup; unit tests; bot vs. bot simulations to check game length and balance.
2. **Online playable (2D placeholder)** – Colyseus rooms, lobby, per-player views, reconnects, bots. Plain card UI to validate the online flow.
3. **3D table** – R3F scene, card fan, deck/discard, seat avatars, turn ring, camera.
4. **Signature moments & audio** – draw/flip, Fuse Cat slow-mo, Snip, explosion, Hiss, Pounce.
5. **Polish & launch** – mobile layouts, accessibility settings, performance pass, playtests, deploy.

---

## 9. Open questions

- Final game title and card names (current names are placeholders we're free to use).
- Turn timer and Hiss window lengths: tune in playtests (starting at 30 s and 3 s).
- Should eliminated players' "ghost cam" see all hands, or is that too spoiler-y for the stream/voice-chat case?
- Should 2-player games use a trimmed deck (e.g., remove half the Alley Cats) to keep the pace up?
- Do we want a "house rules" toggle (e.g., Snip count, hand size) in v1?
