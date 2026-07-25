# Frontend — SpraySense

Vite + React 18 + TypeScript + Framer Motion. No router, no state library — one
`useState` in `App.tsx` drives the whole demo.

## Structure

```
src/
├── main.tsx                    # entry, mounts <App/>
├── App.tsx                     # activeField state + AnimatePresence
├── styles.css                  # all styling (dark theme, CSS variables in :root)
├── data/
│   └── fields.ts               # the 5 demo fields (name, crop, health, risk, grid placement)
└── components/
    ├── FarmOverview.tsx        # screen 1: header + centered field map
    ├── FieldCard.tsx           # one flat field rectangle (hover reveal, layoutId)
    ├── FieldDetail.tsx         # screen 2: fullscreen overlay (feed + weather + CTA)
    ├── LiveFeed.tsx            # video player styled as live cam, canvas fallback
    └── WeatherPanel.tsx        # live Open-Meteo weather for Fresno, CA
```

## Screen 1 — farm overview

- Minimal: black background (`--bg: #070907`), five flat rectangles centered via
  `place-items: center`, sized `min(760px, 88vw) × min(480px, 62vh)`.
- The irregular "farm map" arrangement comes from each field's `gridArea` string
  in [src/data/fields.ts](src/data/fields.ts) — edit those to reshape the map.
- Fill color is flat, derived from the health score in `healthColor()`
  ([src/components/FieldCard.tsx](src/components/FieldCard.tsx)) — no gradients.
- Hover: overlay fades in with health %, pest risk, and the open CTA.
- Only fields with `demoEnabled: true` navigate — all five are enabled, and each
  opens the same shared feed clip labelled with its own name.

## The transition

Classic Framer Motion shared-layout ("expanding card") pattern:

- Each card is a `motion.button` with `layoutId={`field-${id}`}`.
- `FieldDetail` is a fixed-position overlay with the **same** `layoutId`,
  rendered inside `<AnimatePresence>` while the overview stays mounted
  underneath. Mounting it makes Framer animate the card's box up to
  fullscreen; unmounting (back button) animates it back down.
- While the overlay is open, the card renders as an invisible placeholder so
  two elements never hold the same `layoutId` at once.
- Gotcha we hit: `AnimatePresence mode="wait"` breaks this (the crossfade needs
  both trees mounted). Don't reintroduce it.

## Screen 2 — field monitor

**Live feed** ([src/components/LiveFeed.tsx](src/components/LiveFeed.tsx))
- Renders `<video src={FEED_SRC} autoPlay loop muted playsInline>` pointing at
  `public/field-feed.mp4`. One clip serves every field — `FEED_SRC` at the top
  of the file is the single place to change it.
- Three states: `connecting` shows an "Acquiring CAM-01 signal…" overlay while
  the clip buffers (so the frame is never a black rectangle), `playing` on
  `onCanPlay`, `failed` on `onError` — which swaps in a canvas animation
  (drifting NDVI blobs + scanlines) so the demo never shows a dead player.
- `muted` + `playsInline` are load-bearing, not decoration: browsers block
  autoplay for unmuted video, and iOS Safari would otherwise go fullscreen.
- "Live" dressing: blinking LIVE badge, CAM-01 label, real ticking clock (PT).

**Weather** ([src/components/WeatherPanel.tsx](src/components/WeatherPanel.tsx))
- Open-Meteo forecast API — free, **no API key**. Coordinates are Fresno, CA
  (36.7378, -119.7871); change `WEATHER_URL` to move the farm.
- Current conditions + 5-day forecast, °F / mph / inches, re-fetched every 60 s
  ("Updated hh:mm:ss" chip shows the last fetch).
- `sprayCondition()` is a simple heuristic chip (wind > 10 mph or rain → Poor,
  etc.) — purely cosmetic, independent of the ML model.

## The scout flow — wired to the real engine

Only fields carrying an `engine` block in [src/data/fields.ts](src/data/fields.ts)
reach the forecast engine; today that is **South Flat** alone. The engine's
thermal constants are soybean-aphid-specific, so the other four keep the feed +
weather panel and say plainly that their crop is not modelled. Adding a field
means adding the block, not editing components.

The path a grower walks, all four steps verified end to end against the
deployed engine:

1. **Pick a field** on the overview.
2. **Print the blank sheet** (`FORM_URL` → the engine's `GET /form`), count
   aphids in the field with a pen, photograph it.
3. **`POST /scout/ocr`** transcribes the handwriting with Gemini and returns a
   ready `Observation` — or `null` plus `warnings` when the sheet is missing
   something the engine cannot run without.
4. **Correct and confirm.** [ScoutPanel.tsx](src/components/ScoutPanel.tsx)
   shows every transcribed value in an editable grid. Nothing is guessed on the
   grower's behalf: a value the sheet did not state stays `NaN`, renders as an
   empty red-bordered box, and the Confirm button stays disabled until it is
   filled. `n_plants_sampled` drives the forecast's confidence interval, so a
   plausible default there is the one wrong number a demo would never notice.
5. **`POST /forecast`** with every confirmed visit.
   [SprayPlan.tsx](src/components/SprayPlan.tsx) renders the result.

There is also a hand-entry escape hatch ("or type the counts in by hand") that
opens the same review grid with the same confirm gate — insurance for a dead
Gemini key or no wifi on stage.

**Reading the forecast.** Switch on `reason_code`, never on the numbers.
`canBookSprayer()` in [src/api.ts](src/api.ts) is the only thing that decides
whether a booking date is offered: `BELOW_THRESHOLD` can carry a non-null
`recommended_action_date`, and offering to book on it would be wrong. Only
`ABOVE_THRESHOLD` means spray today.

**The calendar** is a 14-day strip from today: filled cell = booking date,
ringed cell = median crossing, tinted band = the 80% interval. The band's width
is the product — it shows how much the next scouting visit is worth.

**No dose.** The engine computes *when*, not *how much*. Nothing in it carries a
product or application rate, so the plan panel shows timing and the economics it
does compute ($/acre, break-even %) and claims no dose.

## Talking to the engine

`BASE` in [src/api.ts](src/api.ts) resolves per deployment:

| Where | `BASE` | Why |
|---|---|---|
| local dev | `/api` | Vite proxies to `:8787` (see `vite.config.ts`) |
| Render | `''` | one host serves the built frontend *and* the API |
| Vercel / split | `VITE_ENGINE_ORIGIN` | cross-origin; relies on the engine's open CORS |

Point local dev at the deployed engine — the one with `GEMINI_API_KEY` — with:

```bash
ENGINE_ORIGIN=https://spraysense.onrender.com npm run dev
```

Types come from [src/types.ts](src/types.ts), the engine's own contract. Keep
every import of it `import type`; a value import breaks Node's type stripping
*and* drags server code into the browser bundle (BACKEND.md, landmine 3).

## Layout notes

- Detail screen is a 2-column grid (feed 1.5fr / scout or weather 1fr); below
  1000px it becomes a scrollable stacked column (`@media` block at the bottom of
  [src/styles.css](src/styles.css)). Don't size panels with `1fr` rows there —
  fixed-height grids compress `min-height: 0` panels and cause overlap.
- Once the spray plan mounts, `.detail-inner` gains `detail-inner-scroll`, which
  switches the viewport-height column to `overflow-y: auto` and gives the feed
  row a real height. Leaving the grid at `flex: 1` with the plan below it
  crushes both panels — the same trap as the `@media` block above.
- Fonts: Inter (UI) + JetBrains Mono (numbers/telemetry), loaded in
  `index.html`. Theme tokens live in `:root` in `styles.css`.

## Commands

```bash
npm run dev       # dev server on :5173
npm run build     # typecheck + production build
npm run preview   # serve the build
```
