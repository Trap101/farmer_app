// node src/cli.ts demo.json

import { readFile } from "node:fs/promises";
import { forecastCrossing } from "./forecast.ts";
import type { Forecast, Observation } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-20" -> "Jul 20". Parsed as UTC so the local timezone cannot shift it. */
function short(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function render(f: Forecast, obs: Observation[]): string {
  const sorted = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const lines: string[] = [];

  lines.push(`Field: ${f.field_id} | Soybean ${latest.growth_stage}`);

  const trail = sorted.map((o) => `${short(o.date)}: ${o.count_per_plant}/plant`).join(" -> ");
  const rho = `rho = ${f.rho_per_dd.toFixed(4)}/DD, 80% CI ${f.rho_ci[0].toFixed(4)}-${f.rho_ci[1].toFixed(4)}`;
  lines.push(`${trail}  (${rho})`);

  const t = f.threshold;
  if (t.basis === "past-benefit") {
    lines.push("Threshold n/a past mid-late R6 (UNL Extension G2063)");
  } else if (t.basis === "early-R6") {
    lines.push(`Threshold ${Math.round(t.et_aphids)} provisional for early R6 (UNL Extension G2063)`);
  } else {
    const drift = Math.round(t.et_aphids) - t.et_consensus;
    const vs = drift === 0 ? "" : `, ${drift > 0 ? "+" : ""}${drift} vs the ${t.et_consensus} rule of thumb`;
    lines.push(
      `Threshold ${Math.round(t.et_aphids)}/plant recomputed from your prices${vs} (Ragsdale et al. 2007)`,
    );
    lines.push(
      `  EIL ${Math.round(t.eil_aphids)}/plant = ${Math.round(t.eil_cad)} aphid-days; gain threshold ${t.gain_threshold_pct.toFixed(2)}% of yield` +
        (t.floored ? " [raised to the practicality floor]" : ""),
    );
  }

  const verdict =
    f.reason_code === "ABOVE_THRESHOLD"
      ? "SPRAY NOW."
      : f.reason_code === "STAGE_PAST_BENEFIT" || f.reason_code === "PREDATOR_SUPPRESSED"
        ? "DON'T SPRAY."
        : f.reason_code === "IMPLAUSIBLE_GROWTH"
          ? "CHECK YOUR NUMBERS."
          : "DON'T SPRAY.";
  lines.push(`${verdict} ${f.message}`);

  if (f.median_cross_date && f.cross_date_ci80) {
    lines.push(
      `Median crossing: ${short(f.median_cross_date)} (80% CI ${short(f.cross_date_ci80[0])} - ${short(f.cross_date_ci80[1])})`,
    );
  } else if (f.reason_code !== "ABOVE_THRESHOLD" && f.reason_code !== "STAGE_PAST_BENEFIT") {
    lines.push("No crossing within the forecast horizon.");
  }

  if (f.recommended_action_date) {
    lines.push(`Book the sprayer for ${short(f.recommended_action_date)}.`);
  }

  return lines.join("\n");
}

const path = process.argv[2];
if (!path) {
  console.error("usage: node src/cli.ts <observations.json>");
  process.exit(1);
}

const input = JSON.parse(await readFile(path, "utf8"));
const forecast = await forecastCrossing(input.observations, input);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(forecast, null, 2));
} else {
  console.log(render(forecast, input.observations));
}
