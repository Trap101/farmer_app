# SpraySense

Hackathon demo — tells farmers exactly when to spray instead of spraying on a fixed schedule.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Demo flow

1. **Farm overview** — 5 fields as minimal flat rectangles on black. Hover a field for a quick health / pest-risk readout.
2. Click **North Ridge** (top-left) — the block scales up to fill the screen (Framer Motion shared-layout transition). Other fields are decorative for the demo.
3. **Field monitor** — "live" field feed on the left, live Fresno CA weather on the right (Open-Meteo, free / no API key, refreshes every 60 s), and the **Calculate next spray date** button at the bottom.

## Notes for the team

- **Video**: drop the encoded field video at `public/field-feed.mp4` and the feed panel plays it automatically (looped, styled as a live cam). Until the file exists, an animated canvas simulation renders instead so the demo never breaks.
- **ML hook**: the calculate button currently simulates a request. Wire the real prediction API in `handleCalculate()` in [src/components/FieldDetail.tsx](src/components/FieldDetail.tsx) — the `TODO(ml-team)` comment marks the spot.
