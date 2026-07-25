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
- Only fields with `demoEnabled: true` navigate (currently just North Ridge).

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
- Renders `<video src="/field-feed.mp4" autoPlay loop muted>` — put the encoded
  video at `public/field-feed.mp4` and it just works.
- If the file is missing, `onError` swaps in a canvas animation (drifting NDVI
  blobs + scanlines) so the demo never shows a broken player.
- "Live" dressing: blinking LIVE badge, CAM-01 label, real ticking clock (PT).

**Weather** ([src/components/WeatherPanel.tsx](src/components/WeatherPanel.tsx))
- Open-Meteo forecast API — free, **no API key**. Coordinates are Fresno, CA
  (36.7378, -119.7871); change `WEATHER_URL` to move the farm.
- Current conditions + 5-day forecast, °F / mph / inches, re-fetched every 60 s
  ("Updated hh:mm:ss" chip shows the last fetch).
- `sprayCondition()` is a simple heuristic chip (wind > 10 mph or rain → Poor,
  etc.) — purely cosmetic, independent of the ML model.

**Calculate next spray date** ([src/components/FieldDetail.tsx](src/components/FieldDetail.tsx))
- `handleCalculate()` currently fakes a 1.8 s request then shows a done state.
- **ML integration point**: replace the simulated wait with the real API call —
  marked `TODO(ml-team)`. The button already handles idle / loading / done UI
  states, so only the fetch needs wiring.

## Layout notes

- Detail screen is a 2-column grid (feed 1.5fr / weather 1fr); below 1000px it
  becomes a scrollable stacked column (`@media` block at the bottom of
  [src/styles.css](src/styles.css)). Don't size panels with `1fr` rows there —
  fixed-height grids compress `min-height: 0` panels and cause overlap.
- Fonts: Inter (UI) + JetBrains Mono (numbers/telemetry), loaded in
  `index.html`. Theme tokens live in `:root` in `styles.css`.

## Commands

```bash
npm run dev       # dev server on :5173
npm run build     # typecheck + production build
npm run preview   # serve the build
```
