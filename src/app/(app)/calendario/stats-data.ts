import type { CalItem } from "./my-calendar";

export type CalendarStatsData = {
  total: number;
  byKind: { key: CalItem["kind"]; label: string; value: number; color: string }[];
  byMonth: { key: string; label: string; value: number }[];
  timedHours: number;
  busiest: { label: string; value: number } | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

const KIND_META: { key: CalItem["kind"]; label: string; color: string }[] = [
  { key: "event", label: "Citas", color: "#6366f1" },
  { key: "task", label: "Entregas", color: "#f59e0b" },
  { key: "shoot", label: "Rodajes", color: "#f43f5e" },
  { key: "milestone", label: "Hitos", color: "#0ea5e9" },
];

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function computeCalendarStats(items: CalItem[], now?: Date): CalendarStatsData {
  const anchor = now ?? new Date();
  const baseYear = anchor.getFullYear();
  const baseMonth = anchor.getMonth();

  const byKind = KIND_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    value: items.reduce((acc, it) => acc + (it.kind === meta.key ? 1 : 0), 0),
  }));

  const byMonth: CalendarStatsData["byMonth"] = [];
  for (let i = 0; i < 6; i++) {
    const y = baseYear + Math.floor((baseMonth + i) / 12);
    const m = (baseMonth + i) % 12;
    const key = `${y}-${pad(m + 1)}`;
    const label = MONTHS_ES[m] + (y !== baseYear ? ` '${pad(y % 100)}` : "");
    const value = items.reduce(
      (acc, it) => acc + (it.date.slice(0, 7) === key ? 1 : 0),
      0,
    );
    byMonth.push({ key, label, value });
  }

  let timedHours = 0;
  for (const it of items) {
    if (it.allDay || !it.start || !it.end) continue;
    const diff = (Date.parse(it.end) - Date.parse(it.start)) / 3_600_000;
    timedHours += Math.max(0, diff);
  }
  timedHours = Math.round(timedHours * 10) / 10;

  const dayCounts = new Map<string, number>();
  for (const it of items) {
    const day = it.date.slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  let busiest: CalendarStatsData["busiest"] = null;
  let bestValue = 0;
  for (const [day, value] of dayCounts) {
    if (value <= bestValue) continue;
    bestValue = value;
    const [y, mo, da] = day.split("-").map((s) => Number(s));
    const label = new Date(y, mo - 1, da).toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    busiest = { label, value };
  }

  return { total: items.length, byKind, byMonth, timedHours, busiest };
}
