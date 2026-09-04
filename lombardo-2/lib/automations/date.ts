export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function argentinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function nextDailyRun(date = new Date()) {
  const today = argentinaDate(date);
  const todayAtRun = new Date(`${today}T03:05:00.000Z`);
  if (todayAtRun.getTime() > date.getTime()) return todayAtRun.toISOString();
  return new Date(`${addCalendarDays(today, 1)}T03:05:00.000Z`).toISOString();
}

export function minuteRunKey(type: string, date = new Date()) {
  return `manual:${type}:${date.toISOString().slice(0, 16)}`;
}
