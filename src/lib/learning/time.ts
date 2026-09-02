import type { DateInput } from "./model";

export const DAY_IN_MS = 24 * 60 * 60 * 1_000;

export function toTimestamp(value: DateInput, label = "Zeitpunkt") {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(label + " ist ungültig.");
  }
  return timestamp;
}

export function toIsoTimestamp(value: DateInput, label?: string) {
  return new Date(toTimestamp(value, label)).toISOString();
}

export function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}
