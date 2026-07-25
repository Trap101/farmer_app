// node src/server.ts
//
// All logic lives in forecast.ts / scout_ocr.ts — this only moves JSON.
// Also serves the Vite build from dist/ so one Render service hosts everything.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { forecastCrossing } from "./forecast.ts";
import { extractScoutingSheet, sheetToObservation } from "./scout_ocr.ts";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveFile(res: import("node:http").ServerResponse, filePath: string) {
  const body = await readFile(filePath);
  res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
  res.end(body);
}

async function serveStatic(res: import("node:http").ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const filePath = normalize(join(DIST, rel));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(filePath);
    if (s.isFile()) return serveFile(res, filePath);
  } catch {
    /* fall through */
  }
  // SPA-style fallback when dist exists; otherwise a clear 404.
  try {
    await stat(join(DIST, "index.html"));
    return serveFile(res, join(DIST, "index.html"));
  } catch {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "POST /forecast or POST /scout/ocr, GET /form, GET /" }));
  }
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    });
    res.end(JSON.stringify(body));
  };

  const url = req.url?.split("?")[0] ?? "/";

  if (req.method === "OPTIONS") return send(204, null);
  if (req.method === "GET" && url === "/health") return send(200, { ok: true });

  // The blank sheet a grower prints, fills in with a pen, and photographs.
  if (req.method === "GET" && url === "/form") {
    const html = await readFile(join(ROOT, "scouting-form.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET") return serveStatic(res, url);

  if (req.method !== "POST" || !["/forecast", "/scout/ocr"].includes(url)) {
    return send(404, { error: "POST /forecast or POST /scout/ocr, GET /form" });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    // ~9 MB of base64 is a phone photo; anything larger is a mistake.
    if (raw.byteLength > 12e6) return send(413, { error: "body too large" });
    const body = JSON.parse(raw.toString("utf8"));

    if (url === "/scout/ocr") {
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

server.listen(PORT, "0.0.0.0", () => console.log(`spraysense on http://0.0.0.0:${PORT}`));
