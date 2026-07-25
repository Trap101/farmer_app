import { useEffect, useRef, useState } from 'react'
import type { Field } from '../data/fields'

interface Props {
  field: Field
}

// Shows the pre-encoded field video styled as a live drone feed.
// Drop the encoded file at public/field-feed.mp4 — if it's missing
// (e.g. before the asset lands), an animated canvas NDVI simulation
// renders instead so the demo never shows a broken player.
export function LiveFeed({ field }: Props) {
  const [videoAvailable, setVideoAvailable] = useState(true)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="panel feed-panel">
      <div className="panel-header">
        <h3>Field feed</h3>
        <span className="live-badge">
          <span className="live-dot" aria-hidden />
          LIVE
        </span>
      </div>

      <div className="feed-frame">
        {videoAvailable ? (
          <video
            className="feed-media"
            src="/field-feed.mp4"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoAvailable(false)}
          />
        ) : (
          <SimulatedFeed field={field} />
        )}

        <div className="feed-overlay">
          <span className="feed-meta">
            CAM-01 · {field.name.toUpperCase().replace(/\s/g, '-')}
          </span>
          <span className="feed-meta feed-clock">
            {clock.toLocaleTimeString('en-US', { hour12: false })} PT
          </span>
        </div>
        <div className="feed-scanline" aria-hidden />
      </div>

      <div className="feed-stats">
        <div className="feed-stat">
          <span className="feed-stat-label">NDVI avg</span>
          <span className="feed-stat-value">
            {(0.4 + field.health / 200).toFixed(2)}
          </span>
        </div>
        <div className="feed-stat">
          <span className="feed-stat-label">Soil moisture</span>
          <span className="feed-stat-value">{field.moisture}%</span>
        </div>
        <div className="feed-stat">
          <span className="feed-stat-label">Coverage</span>
          <span className="feed-stat-value">{field.acres} ac</span>
        </div>
      </div>
    </section>
  )
}

// Canvas fallback: drifting NDVI-style blobs so the frame looks like a
// moving aerial feed even without the video asset.
function SimulatedFeed({ field }: { field: Field }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const blobs = Array.from({ length: 14 }, (_, i) => ({
      x: ((field.seed * (i + 3)) % 100) / 100,
      y: ((field.seed * (i + 7) * 13) % 100) / 100,
      r: 18 + ((field.seed * (i + 1)) % 40),
      hot: i % 4 === 0,
      speed: 0.00004 + (i % 5) * 0.00002,
    }))

    function draw(t: number) {
      const canvasEl = canvasRef.current
      if (!canvasEl || !ctx) return
      const { width: w, height: h } = canvasEl

      const base = ctx.createLinearGradient(0, 0, w, h)
      base.addColorStop(0, '#3d8f35')
      base.addColorStop(0.6, '#2e7d2b')
      base.addColorStop(1, '#469c3c')
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)

      for (const b of blobs) {
        const x = ((b.x + t * b.speed) % 1.2) * w
        const y = b.y * h + Math.sin(t * 0.0004 + b.x * 10) * 12
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r)
        if (b.hot) {
          g.addColorStop(0, 'rgba(228, 87, 46, 0.75)')
          g.addColorStop(0.6, 'rgba(245, 194, 17, 0.4)')
        } else {
          g.addColorStop(0, 'rgba(245, 194, 17, 0.5)')
          g.addColorStop(0.6, 'rgba(190, 214, 48, 0.25)')
        }
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, b.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // subtle noise rows to feel like sensor video
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      for (let y = (t * 0.02) % 6; y < h; y += 6) {
        ctx.fillRect(0, y, w, 1)
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [field])

  return <canvas ref={canvasRef} className="feed-media" width={960} height={540} />
}
