import {
  accentNames,
  itemKinds,
  type AccentName,
  type ChecklistItem,
  type Expense,
  type ItemKind,
  type TripDay,
  type TripItem,
  type TripPlan,
} from "./domain";

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const itemIdPattern = /^[A-Za-z0-9_-]{6,24}$/;

type ObjectPayload = Record<string, unknown>;

const cleanText = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

export function validSessionId(value: unknown): value is string {
  return typeof value === "string" && sessionIdPattern.test(value);
}

export function validDate(value: string) {
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function validHttpsUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validItem(value: unknown): value is TripItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ObjectPayload;
  const id = cleanText(item.id, 24);
  const kind = cleanText(item.kind, 12);
  const time = cleanText(item.time, 5);
  const title = cleanText(item.title, 80);
  const place = cleanText(item.place, 120);
  const note = cleanText(item.note, 300);
  const url = cleanText(item.url, 300);
  const cost = Number(item.cost);
  return (
    itemIdPattern.test(id) &&
    itemKinds.includes(kind as ItemKind) &&
    (!time || timePattern.test(time)) &&
    title.length > 0 &&
    place === item.place &&
    note === item.note &&
    url === item.url &&
    validHttpsUrl(url) &&
    Number.isInteger(cost) &&
    cost >= 0 &&
    cost <= 10_000_000
  );
}

function validDay(value: unknown, startDate: string, endDate: string): value is TripDay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const day = value as ObjectPayload;
  const date = cleanText(day.date, 10);
  const label = cleanText(day.label, 40);
  return (
    validDate(date) &&
    date >= startDate &&
    date <= endDate &&
    label === day.label &&
    Array.isArray(day.items) &&
    day.items.length <= 24 &&
    day.items.every(validItem)
  );
}

function validChecklistItem(value: unknown): value is ChecklistItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ObjectPayload;
  const id = cleanText(item.id, 24);
  const text = cleanText(item.text, 100);
  const owner = cleanText(item.owner, 40);
  return (
    itemIdPattern.test(id) &&
    text.length > 0 &&
    text === item.text &&
    owner === item.owner &&
    typeof item.checked === "boolean"
  );
}

function validExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ObjectPayload;
  const id = cleanText(item.id, 24);
  const label = cleanText(item.label, 80);
  const paidBy = cleanText(item.paidBy, 40);
  const amount = Number(item.amount);
  return (
    itemIdPattern.test(id) &&
    label.length > 0 &&
    label === item.label &&
    paidBy === item.paidBy &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    amount <= 10_000_000
  );
}

export function validatePlan(value: unknown, startDate: string, endDate: string): TripPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as ObjectPayload;
  if (
    !Array.isArray(plan.days) ||
    !Array.isArray(plan.travelers) ||
    !Array.isArray(plan.checklist) ||
    !Array.isArray(plan.expenses) ||
    plan.days.length > 14 ||
    plan.travelers.length > 12 ||
    plan.checklist.length > 100 ||
    plan.expenses.length > 100 ||
    !plan.days.every((day) => validDay(day, startDate, endDate)) ||
    !plan.checklist.every(validChecklistItem) ||
    !plan.expenses.every(validExpense)
  ) {
    return null;
  }
  const travelerValues = plan.travelers as unknown[];
  const travelers = travelerValues.map((name) => cleanText(name, 40));
  if (
    travelers.some((name, index) => !name || name !== travelerValues[index]) ||
    new Set(travelers).size !== travelers.length
  ) {
    return null;
  }
  const ids = [
    ...plan.days.flatMap((day) => (day as TripDay).items.map((item) => item.id)),
    ...plan.checklist.map((item) => (item as ChecklistItem).id),
    ...plan.expenses.map((item) => (item as Expense).id),
  ];
  if (new Set(ids).size !== ids.length) return null;
  return {
    checklist: plan.checklist as ChecklistItem[],
    days: plan.days as TripDay[],
    expenses: plan.expenses as Expense[],
    travelers,
  };
}

export type ValidTripInput = {
  accent: AccentName;
  destination: string;
  endDate: string;
  plan: TripPlan;
  sessionId: string;
  startDate: string;
  title: string;
};

export function validateTripInput(payload: ObjectPayload): ValidTripInput | null {
  const title = cleanText(payload.title, 80);
  const destination = cleanText(payload.destination, 100);
  const startDate = cleanText(payload.startDate, 10);
  const endDate = cleanText(payload.endDate, 10);
  const accent = cleanText(payload.accent, 12);
  const plan = validatePlan(payload.plan, startDate, endDate);
  if (
    title.length < 2 ||
    destination.length < 1 ||
    !validDate(startDate) ||
    !validDate(endDate) ||
    endDate < startDate ||
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 > 13 ||
    !accentNames.includes(accent as AccentName) ||
    !plan ||
    !validSessionId(payload.sessionId) ||
    cleanText(payload.website, 200)
  ) {
    return null;
  }
  const startTimestamp = Date.parse(`${startDate}T00:00:00Z`);
  const endTimestamp = Date.parse(`${endDate}T23:59:59Z`);
  if (
    startTimestamp < Date.now() - 90 * 86_400_000 ||
    endTimestamp > Date.now() + 370 * 86_400_000
  ) {
    return null;
  }
  return {
    accent: accent as AccentName,
    destination,
    endDate,
    plan,
    sessionId: payload.sessionId,
    startDate,
    title,
  };
}

export function validateTripUpdate(payload: ObjectPayload) {
  const input = validateTripInput(payload);
  const revision = Number(payload.revision);
  return input && Number.isInteger(revision) && revision >= 1 && revision < 10_000
    ? { ...input, revision }
    : null;
}

export function tripExpiry(endDate: string) {
  return Math.floor(Date.parse(`${endDate}T23:59:59Z`) / 1000) + 35 * 86_400;
}
