import { Hono, type Context } from "hono";
import { requestId } from "hono/request-id";

import { loadTrip, loadTripBundle } from "./data";
import { securityHeaders } from "./middleware/security";
import { bearerToken, hashValue, randomToken } from "./security/tokens";
import { HomePage, NotFoundPage, PrivacyPage, TripPage } from "./ui/pages";
import { tripExpiry, validateTripInput, validateTripUpdate, validSessionId } from "./validation";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  WRITE_LIMITER: RateLimit;
};

type AppContext = Context<{ Bindings: Bindings }>;
type ObjectPayload = Record<string, unknown>;

const app = new Hono<{ Bindings: Bindings }>();
const tripIdPattern = /^[A-Za-z0-9_-]{10,12}$/;
const telemetryNames = new Set([
  "visited",
  "created",
  "edited",
  "shared",
  "printed",
  "exported",
  "returned",
]);

app.use("*", requestId());
app.use("*", securityHeaders);

function apiError(c: AppContext, status: 400 | 401 | 403 | 404 | 409 | 413 | 429, error: string) {
  return c.json({ error, requestId: c.get("requestId") }, status);
}

function validWriteOrigin(c: AppContext) {
  const fetchSite = c.req.header("Sec-Fetch-Site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

async function readJson(c: AppContext, maximumBytes = 52_000): Promise<ObjectPayload | null> {
  const contentType = c.req.header("Content-Type") ?? "";
  const contentLength = Number(c.req.header("Content-Length") ?? "0");
  if (
    !contentType.toLowerCase().startsWith("application/json") ||
    (contentLength > 0 && contentLength > maximumBytes)
  ) {
    return null;
  }
  const raw = await c.req.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > maximumBytes) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ObjectPayload)
      : null;
  } catch {
    return null;
  }
}

async function allowWrite(c: AppContext, key: string) {
  const outcome = await c.env.WRITE_LIMITER.limit({ key });
  return outcome.success;
}

async function requireEditor(c: AppContext, tripId: string) {
  const token = bearerToken(c.req.header("Authorization"));
  if (!token) return null;
  const trip = await loadTrip(c.env.DB, tripId);
  if (!trip || (await hashValue(token)) !== trip.edit_token_hash) return null;
  return trip;
}

app.get("/", (c) => c.html(<HomePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.get("/t/:id", async (c) => {
  const id = c.req.param("id");
  const bundle = tripIdPattern.test(id) ? await loadTripBundle(c.env.DB, id) : null;
  return bundle ? c.html(<TripPage bundle={bundle} />) : c.html(<NotFoundPage />, 404);
});

app.post("/api/trips", async (c) => {
  if (!validWriteOrigin(c)) return apiError(c, 403, "cross_site_request");
  const payload = await readJson(c);
  const input = payload ? validateTripInput(payload) : null;
  if (!input) return apiError(c, 400, "invalid_trip");
  if (!(await allowWrite(c, `create:${input.sessionId}`))) {
    return apiError(c, 429, "rate_limited");
  }

  const id = randomToken(8);
  const editToken = randomToken(32);
  await c.env.DB.prepare(
    `INSERT INTO trips
       (id, edit_token_hash, title, destination, start_date, end_date,
        accent, plan_json, revision, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      id,
      await hashValue(editToken),
      input.title,
      input.destination,
      input.startDate,
      input.endDate,
      input.accent,
      JSON.stringify(input.plan),
      tripExpiry(input.endDate),
    )
    .run();

  return c.json(
    {
      editPath: `/t/${id}#${editToken}`,
      editToken,
      sharePath: `/t/${id}`,
      tripId: id,
    },
    201,
  );
});

app.get("/api/trips/:id", async (c) => {
  const id = c.req.param("id");
  if (!tripIdPattern.test(id)) return apiError(c, 404, "trip_not_found");
  const bundle = await loadTripBundle(c.env.DB, id);
  return bundle ? c.json(bundle) : apiError(c, 404, "trip_not_found");
});

app.get("/api/trips/:id/manage", async (c) => {
  const id = c.req.param("id");
  const trip = tripIdPattern.test(id) ? await requireEditor(c, id) : null;
  if (!trip) return apiError(c, 401, "invalid_edit_token");
  const bundle = await loadTripBundle(c.env.DB, id);
  return bundle ? c.json(bundle) : apiError(c, 404, "trip_not_found");
});

app.put("/api/trips/:id", async (c) => {
  if (!validWriteOrigin(c)) return apiError(c, 403, "cross_site_request");
  const id = c.req.param("id");
  const trip = tripIdPattern.test(id) ? await requireEditor(c, id) : null;
  if (!trip) return apiError(c, 401, "invalid_edit_token");
  const payload = await readJson(c);
  const input = payload ? validateTripUpdate(payload) : null;
  if (!input) return apiError(c, 400, "invalid_trip");
  if (!(await allowWrite(c, `edit:${input.sessionId}`))) {
    return apiError(c, 429, "rate_limited");
  }

  const result = await c.env.DB.prepare(
    `UPDATE trips
     SET title = ?, destination = ?, start_date = ?, end_date = ?, accent = ?,
         plan_json = ?, revision = revision + 1, expires_at = ?, updated_at = unixepoch()
     WHERE id = ? AND revision = ?`,
  )
    .bind(
      input.title,
      input.destination,
      input.startDate,
      input.endDate,
      input.accent,
      JSON.stringify(input.plan),
      tripExpiry(input.endDate),
      id,
      input.revision,
    )
    .run();
  if (!result.meta.changes) return apiError(c, 409, "stale_revision");
  const bundle = await loadTripBundle(c.env.DB, id);
  return bundle ? c.json(bundle) : apiError(c, 404, "trip_not_found");
});

app.delete("/api/trips/:id", async (c) => {
  if (!validWriteOrigin(c)) return apiError(c, 403, "cross_site_request");
  const id = c.req.param("id");
  const trip = tripIdPattern.test(id) ? await requireEditor(c, id) : null;
  if (!trip) return apiError(c, 401, "invalid_edit_token");
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

app.post("/api/telemetry", async (c) => {
  if (!validWriteOrigin(c)) return apiError(c, 403, "cross_site_request");
  const payload = await readJson(c, 600);
  const name = typeof payload?.name === "string" ? payload.name : "";
  if (
    payload?.automated === true ||
    !telemetryNames.has(name) ||
    !validSessionId(payload?.sessionId)
  ) {
    return payload?.automated === true ? c.body(null, 204) : apiError(c, 400, "invalid_telemetry");
  }
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO product_events (session_hash, name, occurred_on)
     VALUES (?, ?, date('now'))`,
  )
    .bind(await hashValue(payload.sessionId), name)
    .run();
  return c.body(null, 204);
});

app.get("/healthz", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({
    healthy: true,
    service: "tabidan",
    time: new Date().toISOString(),
  });
});

app.notFound((c) => {
  if (!c.req.path.startsWith("/api/")) return c.html(<NotFoundPage />, 404);
  return c.json({ error: "not_found", requestId: c.get("requestId") }, 404);
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      event: "request_failed",
      message: error.message,
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

async function cleanup(db: D1Database) {
  await db.batch([
    db.prepare("DELETE FROM trips WHERE expires_at < unixepoch()"),
    db.prepare("DELETE FROM product_events WHERE occurred_on < date('now', '-35 days')"),
  ]);
}

export { app };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(cleanup(env.DB));
  },
};
