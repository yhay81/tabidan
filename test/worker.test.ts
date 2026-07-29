import { describe, expect, it } from "vitest";

import type { TripPlan, TripRecord } from "../src/domain";
import { hashValue } from "../src/security/tokens";
import { validatePlan, validateTripInput } from "../src/validation";
import { app, type Bindings } from "../src/worker";

const sessionId = "313c096a-2ab6-4bda-a6bc-21361e522e99";

type RecordedStatement = {
  bindings: unknown[];
  sql: string;
};

function database(options: { changes?: number; trip?: TripRecord } = {}) {
  const recorded: RecordedStatement[] = [];
  const db = {
    batch: () => Promise.resolve([]),
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        first: async () => (sql.includes("FROM trips") ? (options.trip ?? null) : null),
        run: async () => {
          recorded.push({ bindings, sql });
          return { meta: { changes: options.changes ?? 1 }, success: true };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, recorded };
}

function bindings(db: D1Database): Bindings {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("not used")),
    } as unknown as Fetcher,
    DB: db,
    WRITE_LIMITER: {
      limit: () => Promise.resolve({ success: true }),
    },
  };
}

const futureDate = (offset = 14) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function plan(): TripPlan {
  return {
    checklist: [
      {
        checked: false,
        id: "check001",
        owner: "ao",
        text: "充電器",
      },
    ],
    days: [
      {
        date: futureDate(),
        items: [
          {
            cost: 3000,
            id: "route001",
            kind: "move",
            note: "改札前",
            place: "東京駅",
            time: "09:00",
            title: "新幹線で出発",
            url: "https://example.com/reservation",
          },
        ],
        label: "",
      },
      {
        date: futureDate(15),
        items: [],
        label: "",
      },
    ],
    expenses: [
      {
        amount: 3000,
        id: "cost0001",
        label: "新幹線",
        paidBy: "ao",
      },
    ],
    travelers: ["ao", "mio"],
  };
}

function trip(editTokenHash = "hash"): TripRecord {
  return {
    accent: "coast",
    created_at: 1,
    destination: "石川県 金沢",
    edit_token_hash: editTokenHash,
    end_date: futureDate(15),
    expires_at: Math.floor(Date.now() / 1000) + 60 * 86_400,
    id: "AbCdEfGhIjK",
    plan_json: JSON.stringify(plan()),
    revision: 1,
    start_date: futureDate(),
    title: "週末の金沢",
    updated_at: 1,
  };
}

function createPayload() {
  return {
    accent: "sunrise",
    destination: "石川県 金沢",
    endDate: futureDate(15),
    plan: plan(),
    sessionId,
    startDate: futureDate(),
    title: "週末の金沢",
    website: "",
  };
}

describe("worker", () => {
  it("renders the product workspace without a text-led hero or experiment copy", async () => {
    const { db } = database();
    const response = await app.request("/", undefined, bindings(db));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(html).toContain('lang="ja"');
    expect(html).toContain('id="create-trip-form"');
    expect(html).toContain('class="trip-preview"');
    expect(html).toContain("予定を貼り付け");
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain("仮説");
    expect(html).not.toContain("成功条件");
  });

  it("creates a trip while storing only a hash of the edit token", async () => {
    const { db, recorded } = database();
    const response = await app.request(
      "/api/trips",
      {
        body: JSON.stringify(createPayload()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      bindings(db),
    );
    const body = await response.json<{ editPath: string; editToken: string; tripId: string }>();

    expect(response.status).toBe(201);
    expect(body.tripId).toMatch(/^[A-Za-z0-9_-]{10,12}$/);
    expect(body.editPath).toContain(`#${body.editToken}`);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.sql).toContain("INSERT INTO trips");
    expect(recorded[0]?.bindings[1]).toBe(await hashValue(body.editToken));
    expect(recorded[0]?.bindings).not.toContain(body.editToken);
  });

  it("renders an unindexed shared trip without the secret hash", async () => {
    const { db } = database({ trip: trip() });
    const response = await app.request("/t/AbCdEfGhIjK", undefined, bindings(db));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("週末の金沢");
    expect(html).toContain("新幹線で出発");
    expect(html).toContain("充電器");
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain("edit_token_hash");
  });

  it("requires the edit token before returning the management bundle", async () => {
    const editToken = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12";
    const { db } = database({ trip: trip(await hashValue(editToken)) });
    const environment = bindings(db);
    const accepted = await app.request(
      "/api/trips/AbCdEfGhIjK/manage",
      { headers: { Authorization: `Bearer ${editToken}` } },
      environment,
    );
    const rejected = await app.request(
      "/api/trips/AbCdEfGhIjK/manage",
      { headers: { Authorization: "Bearer invalid-token-value-1234" } },
      environment,
    );

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(401);
  });

  it("uses optimistic revisions and rejects stale saves", async () => {
    const editToken = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12";
    const { db } = database({
      changes: 0,
      trip: trip(await hashValue(editToken)),
    });
    const response = await app.request(
      "/api/trips/AbCdEfGhIjK",
      {
        body: JSON.stringify({ ...createPayload(), revision: 1 }),
        headers: {
          Authorization: `Bearer ${editToken}`,
          "Content-Type": "application/json",
        },
        method: "PUT",
      },
      bindings(db),
    );

    expect(response.status).toBe(409);
    expect((await response.json<{ error: string }>()).error).toBe("stale_revision");
  });

  it("rejects cross-site writes before touching the database", async () => {
    const { db, recorded } = database();
    const response = await app.request(
      "/api/trips",
      {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "cross-site",
        },
        method: "POST",
      },
      bindings(db),
    );

    expect(response.status).toBe(403);
    expect(recorded).toHaveLength(0);
  });

  it("hashes genuine telemetry and discards automated QA", async () => {
    const { db, recorded } = database();
    const environment = bindings(db);
    const accepted = await app.request(
      "/api/telemetry",
      {
        body: JSON.stringify({ automated: false, name: "shared", sessionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      environment,
    );
    const discarded = await app.request(
      "/api/telemetry",
      {
        body: JSON.stringify({ automated: true, name: "visited", sessionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      environment,
    );

    expect(accepted.status).toBe(204);
    expect(discarded.status).toBe(204);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.bindings[0]).toBe(await hashValue(sessionId));
    expect(recorded[0]?.bindings).not.toContain(sessionId);
  });

  it("exposes health and a Japanese HTML not-found page", async () => {
    const { db } = database();
    const environment = bindings(db);
    const health = await app.request("/healthz", undefined, environment);
    const missing = await app.request("/missing", undefined, environment);

    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect((await health.json<{ healthy: boolean }>()).healthy).toBe(true);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("このしおりは見つかりません");
  });
});

describe("validation", () => {
  it("accepts a bounded trip and rejects impossible ranges and honeypots", () => {
    const valid = createPayload();
    expect(validateTripInput(valid)?.title).toBe("週末の金沢");
    expect(validateTripInput({ ...valid, endDate: futureDate(30) })).toBeNull();
    expect(validateTripInput({ ...valid, website: "spam.example" })).toBeNull();
  });

  it("requires HTTPS links and unique bounded item IDs", () => {
    const valid = plan();
    expect(validatePlan(valid, futureDate(), futureDate(15))).not.toBeNull();
    const insecure = structuredClone(valid);
    insecure.days[0]!.items[0]!.url = "http://example.com";
    expect(validatePlan(insecure, futureDate(), futureDate(15))).toBeNull();
    const duplicate = structuredClone(valid);
    duplicate.checklist[0]!.id = duplicate.days[0]!.items[0]!.id;
    expect(validatePlan(duplicate, futureDate(), futureDate(15))).toBeNull();
  });
});
