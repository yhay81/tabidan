export const accentNames = ["sunrise", "coast", "forest", "night"] as const;
export const itemKinds = ["move", "stay", "food", "see", "free"] as const;

export type AccentName = (typeof accentNames)[number];
export type ItemKind = (typeof itemKinds)[number];

export type TripItem = {
  cost: number;
  id: string;
  kind: ItemKind;
  note: string;
  place: string;
  time: string;
  title: string;
  url: string;
};

export type TripDay = {
  date: string;
  items: TripItem[];
  label: string;
};

export type ChecklistItem = {
  checked: boolean;
  id: string;
  owner: string;
  text: string;
};

export type Expense = {
  amount: number;
  id: string;
  label: string;
  paidBy: string;
};

export type TripPlan = {
  checklist: ChecklistItem[];
  days: TripDay[];
  expenses: Expense[];
  travelers: string[];
};

export type TripRecord = {
  accent: AccentName;
  created_at: number;
  destination: string;
  edit_token_hash: string;
  end_date: string;
  expires_at: number;
  id: string;
  plan_json: string;
  revision: number;
  start_date: string;
  title: string;
  updated_at: number;
};

export type PublicTrip = Omit<TripRecord, "edit_token_hash" | "plan_json">;

export type TripBundle = {
  plan: TripPlan;
  trip: PublicTrip;
};

export function emptyPlan(): TripPlan {
  return {
    checklist: [],
    days: [],
    expenses: [],
    travelers: [],
  };
}

export function toPublicTrip(trip: TripRecord): PublicTrip {
  const { edit_token_hash: _token, plan_json: _plan, ...publicTrip } = trip;
  return publicTrip;
}
