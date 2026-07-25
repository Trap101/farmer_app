import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import '../landing.css'

interface Props {
  onEnter: () => void
}

// Drop a hero photo here to replace the generated backdrop. If it is absent
// (or fails to decode) the layered CSS field below shows instead, so the page
// never renders a broken image.
const HERO_SRC = '/hero.jpg'

// Stagger has to live in the container's own variant — passing it via the
// `transition` prop makes children inherit it as their transition, which
// leaves them with no duration and effectively frozen.
const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
}

export function LandingPage({ onEnter }: Props) {
  const [heroLoaded, setHeroLoaded] = useState(false)
  // The hero copy is the most important content on the page, so it must never
  // depend on an animation having run. With reduced motion it renders in place.
  const reduceMotion = useReducedMotion()
  const anim = reduceMotion
    ? { initial: undefined, animate: undefined, variants: undefined }
    : { initial: 'hidden' as const, animate: 'show' as const }

  return (
    <div className="landing">
      <nav className="lp-nav">
        <div className="lp-brand">
          <img className="lp-logo" src="/logo.png" alt="" aria-hidden />
          <span className="lp-wordmark">SpraySense</span>
        </div>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#engine">The engine</a>
          <button className="lp-btn lp-btn-ghost" onClick={onEnter}>
            Open dashboard
          </button>
        </div>
      </nav>

      {/* ---------------- hero ---------------- */}
      <header className="lp-hero">
        <div className={`lp-hero-bg ${heroLoaded ? 'is-photo' : ''}`}>
          <img
            src={HERO_SRC}
            alt=""
            aria-hidden
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroLoaded(false)}
          />
        </div>

        <motion.div
          className="lp-hero-inner"
          variants={reduceMotion ? undefined : heroStagger}
          {...anim}
        >
          <motion.span className="lp-eyebrow" variants={reduceMotion ? undefined : rise}>
            Economic threshold forecasting
          </motion.span>

          <motion.h1 variants={reduceMotion ? undefined : rise}>
            Stop spraying the calendar.
            <span className="lp-h1-accent">Spray the date that pays.</span>
          </motion.h1>

          <motion.p className="lp-sub" variants={reduceMotion ? undefined : rise}>
            SpraySense predicts the day a pest population crosses the threshold
            where spraying finally costs less than the damage — computed from
            your prices, your scout counts and the weather your field will
            actually get.
          </motion.p>

          <motion.div className="lp-cta-row" variants={reduceMotion ? undefined : rise}>
            <button className="lp-btn lp-btn-primary" onClick={onEnter}>
              Open the dashboard
            </button>
            <a className="lp-btn lp-btn-ghost" href="#how">
              See how it works
            </a>
          </motion.div>

          <motion.div className="lp-hero-proof" variants={reduceMotion ? undefined : rise}>
            <div>
              <strong>±40%</strong>
              <span>how far the 250 rule of thumb drifts at today's prices</span>
            </div>
            <div>
              <strong>80% CI</strong>
              <span>every forecast ships a date range, not a guess</span>
            </div>
            <div>
              <strong>0.25%</strong>
              <span>max error reproducing the published Ragsdale figures</span>
            </div>
          </motion.div>
        </motion.div>
      </header>

      {/* ---------------- problem ---------------- */}
      <section className="lp-section lp-problem">
        <div className="lp-problem-grid">
          <div>
            <h2>
              Most growers spray on a date they picked in advance — or on a
              number from 2003.
            </h2>
          </div>
          <div className="lp-problem-body">
            <p>
              The 250 aphids-per-plant treatment threshold is a consensus rule
              of thumb. It was never meant to survive a decade of moving crop
              prices and input costs, and at today's numbers it can be off by
              nearly half in either direction.
            </p>
            <p>
              Spray too early and you burn a pass you didn't need, and the
              population rebounds without its predators. Spray too late and the
              yield is already gone. Both mistakes look identical on the
              calendar.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="lp-section" id="how">
        <span className="lp-kicker">How it works</span>
        <h2 className="lp-section-title">Three steps, one date.</h2>

        <div className="lp-steps">
          <article className="lp-step">
            <span className="lp-step-n">01</span>
            <h3>Scout on paper</h3>
            <p>
              Your scout counts plants the way they already do, on the same
              clipboard sheet. Photograph the finished sheet and it gets
              transcribed into structured counts automatically — no tablet, no
              app to learn in the field.
            </p>
          </article>

          <article className="lp-step">
            <span className="lp-step-n">02</span>
            <h3>The engine recomputes your threshold</h3>
            <p>
              Not the textbook 250. Your actual crop price and spray cost run
              through the Ragsdale equation chain to produce the threshold that
              is economically correct for <em>this</em> field, this season.
            </p>
          </article>

          <article className="lp-step">
            <span className="lp-step-n">03</span>
            <h3>You get a date and a confidence range</h3>
            <p>
              The population is projected forward in physiological time against
              the real forecast, thousands of times over, giving you a median
              crossing date and the range around it — enough to book a sprayer
              with.
            </p>
          </article>
        </div>
      </section>

      {/* ---------------- sample output ---------------- */}
      <section className="lp-section lp-output" id="engine">
        <div className="lp-output-grid">
          <div className="lp-output-copy">
            <span className="lp-kicker">The answer</span>
            <h2 className="lp-section-title">
              It tells you when <em>not</em> to spray, too.
            </h2>
            <p>
              A recommendation you can't argue with is a recommendation you
              can't trust. Every forecast names the reason behind it and cites
              the sources behind each number in that specific run.
            </p>
            <ul className="lp-checklist">
              <li>Never recommends a spray the crop is too far along to benefit from</li>
              <li>Backs off when predator populations are already suppressing the pest</li>
              <li>Refuses to fire on a count pattern that is physically implausible</li>
              <li>Widens the interval instead of bluffing when data is thin</li>
            </ul>
          </div>

          <div className="lp-terminal" role="img" aria-label="Example engine output">
            <div className="lp-terminal-bar">
              <span /><span /><span />
              <em>spraysense — forecast</em>
            </div>
            <pre>
              <code>
                <span className="t-dim">Field: North 40 | Soybean R3</span>
                {'\n'}
                Jul 20: 95/plant <span className="t-dim">→</span> Jul 24: 180/plant
                {'\n\n'}
                <span className="t-amber">Threshold 288/plant</span> recomputed from
                your prices
                {'\n'}
                <span className="t-dim">  +38 vs the 250 rule of thumb</span>
                {'\n\n'}
                <span className="t-green">DON'T SPRAY.</span> 65% chance of crossing
                within 7 days.
                {'\n'}
                <span className="t-dim">Median crossing: Jul 31 (80% CI Jul 27 – Aug 4)</span>
                {'\n\n'}
                <span className="t-green">▸ Book the sprayer for Jul 27.</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ---------------- differentiators ---------------- */}
      <section className="lp-section">
        <span className="lp-kicker">Why it's different</span>
        <h2 className="lp-section-title">Built on agronomy, not vibes.</h2>

        <div className="lp-cards">
          <article className="lp-card">
            <h3>Physiological time</h3>
            <p>
              Insects don't develop on calendar days, they develop on heat. A
              heat wave past the pest's optimum correctly <em>delays</em> the
              crossing here, where a naive degree-day model would rush it
              forward.
            </p>
          </article>
          <article className="lp-card">
            <h3>Uncertainty is the product</h3>
            <p>
              Count error, growth-rate uncertainty and forecast error are all
              propagated. The width of the resulting interval tells you exactly
              how much your next scouting visit is worth.
            </p>
          </article>
          <article className="lp-card">
            <h3>Your economics, not a default</h3>
            <p>
              Crop price and application cost are inputs, not constants. Change
              what you're getting per bushel and the threshold moves with it.
            </p>
          </article>
          <article className="lp-card">
            <h3>Every number is cited</h3>
            <p>
              Each constant traces back to published work, and the corrections
              made where the research disagreed with the original spec are
              documented rather than buried.
            </p>
          </article>
        </div>
      </section>

      {/* ---------------- final CTA ---------------- */}
      <section className="lp-final">
        <img className="lp-final-logo" src="/logo.png" alt="" aria-hidden />
        <h2>See it running on a real field.</h2>
        <p>
          Five fields, a live camera feed and current conditions — then ask it
          for the date.
        </p>
        <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onEnter}>
          Open the dashboard
        </button>
      </section>

      <footer className="lp-footer">
        <div className="lp-brand">
          <img className="lp-logo lp-logo-sm" src="/logo.png" alt="" aria-hidden />
          <span>SpraySense</span>
        </div>
        <span className="lp-footer-note">
          Thresholds after Ragsdale et al. 2007 · Weather by Open-Meteo
        </span>
      </footer>
    </div>
  )
}
