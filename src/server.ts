// node src/server.ts
//
// All logic lives in forecast.ts / scout_ocr.ts — this only moves JSON.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { forecastCrossing } from "./forecast.ts";
import { extractScoutingSheet, sheetToObservation } from "./scout_ocr.ts";

const PORT = Number(process.env.PORT ?? 8787);

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    });
    res.end(JSON.stringify(body));
  };

  if (req.method === "OPTIONS") return send(204, null);
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });

  // The blank sheet a grower prints, fills in with a pen, and photographs.
  if (req.method === "GET" && req.url === "/form") {
    const html = await readFile(new URL("../scouting-form.html", import.meta.url));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method !== "POST" || !["/forecast", "/scout/ocr"].includes(req.url ?? "")) {
    return send(404, { error: "POST /forecast or POST /scout/ocr, GET /form" });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    // ~9 MB of base64 is a phone photo; anything larger is a mistake.
    if (raw.byteLength > 12e6) return send(413, { error: "body too large" });
    const body = JSON.parse(raw.toString("utf8"));

    if (req.url === "/scout/ocr") {
      const data = String(body.image_base64 ?? "").replace(/^data:[^,]*,/, "");
      if (!data) return send(400, { error: "image_base64 is required" });
      const sheet = await extractScoutingSheet({ data, mime_type: body.mime_type });
      const { observation, warnings } = sheetToObservation(sheet, body.pest ?? "aphid");
      return send(200, { sheet, observation, warnings });
    }

    if (!Array.isArray(body.observations) || body.observations.length === 0) {
      return send(400, { error: "observations must be a non-empty array" });
    }
    for (const key of ["lat", "lon", "crop_price", "spray_cost_per_acre"]) {
      if (typeof body[key] !== "number" || !Number.isFinite(body[key])) {
        return send(400, { error: `${key} must be a finite number` });
      }
    }

    send(200, await forecastCrossing(body.observations, body));
  } catch (err) {
    send(400, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => console.log(`forecast engine on http://localhost:${PORT}`));
