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
2. Click **any field** — the block scales up to fill the screen (Framer Motion shared-layout transition).
3. **Field monitor** — the field feed video plays on the left, live Fresno CA weather on the right (Open-Meteo, free / no API key, refreshes every 60 s), and the **Calculate next spray date** button at the bottom.

## Notes for the team

- **Video**: `public/field-feed.mp4` (1280×720 h264, 8 s loop) is the feed footage. Every field shares this one clip and just relabels it `CAM-01 · <FIELD NAME>` — swap that file to change the footage everywhere. If it's ever missing or won't decode, an animated canvas simulation renders instead so the demo never breaks.
- **ML hook**: the calculate button currently simulates a request. Wire the real prediction API in `handleCalculate()` in [src/components/FieldDetail.tsx](src/components/FieldDetail.tsx) — the `TODO(ml-team)` comment marks the spot.
