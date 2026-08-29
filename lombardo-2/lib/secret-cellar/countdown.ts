const ARGENTINA_UTC_OFFSET_HOURS = 3;

const argentinaDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Cordoba",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function millisecondsUntilNextSecretCellarChallenge(nowMs: number): number {
  const parts = argentinaDateParts.formatToParts(new Date(nowMs));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const nextMidnightInArgentina = Date.UTC(
    year,
    month - 1,
    day + 1,
    ARGENTINA_UTC_OFFSET_HOURS,
  );
  return Math.max(0, nextMidnightInArgentina - nowMs);
}

export function formatSecretCellarCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(" : ");
}
