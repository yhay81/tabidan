import { emptyPlan, type TripBundle, type TripPlan, type TripRecord, toPublicTrip } from "./domain";

export async function loadTrip(db: D1Database, id: string): Promise<TripRecord | null> {
  return db
    .prepare(
      `SELECT id, edit_token_hash, title, destination, start_date, end_date,
              accent, plan_json, revision, expires_at, created_at, updated_at
       FROM trips
       WHERE id = ? AND expires_at >= unixepoch()`,
    )
    .bind(id)
    .first<TripRecord>();
}

export function decodePlan(raw: string): TripPlan {
  try {
    return JSON.parse(raw) as TripPlan;
  } catch {
    return emptyPlan();
  }
}

export async function loadTripBundle(db: D1Database, id: string): Promise<TripBundle | null> {
  const trip = await loadTrip(db, id);
  if (!trip) {
    return null;
  }
  return {
    plan: decodePlan(trip.plan_json),
    trip: toPublicTrip(trip),
  };
}
