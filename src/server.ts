// node src/server.ts
//
// One route. All logic lives in forecast.ts — this only moves JSON.

import { createServer } from "node:http";
import { forecastCrossing } from "./forecast.ts";

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

  if (req.method !== "POST" || req.url !== "/forecast") {
    return send(404, { error: "POST /forecast" });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

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
