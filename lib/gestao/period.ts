export type Period = { start: string; end: string };

/** Calendar week, Monday through Sunday, independent of the browser timezone. */
export function weekPeriod(reference: string, offset: 0 | -1 = 0): Period {
  const start = new Date(reference + "T12:00:00Z");
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday + offset * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function withinPeriod(date: string, period: Period): boolean {
  return (!period.start || date >= period.start) &&
    (!period.end || date <= period.end);
}
