// Loaded directly by Node (type stripping) from scripts/validate-env.ts, so keep it
// erasable-syntax only (no enums) and give any relative import a `.ts` extension.
export const D1_SIZE_REPORT_FREQUENCIES = ['Month', 'Week', 'Day', 'None'] as const;

export type D1SizeReportFrequency = (typeof D1_SIZE_REPORT_FREQUENCIES)[number];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Exact-match parse. Returns null for anything that is not one of the allowed values. */
export function parseD1SizeReportFrequency(value: unknown): D1SizeReportFrequency | null {
  return D1_SIZE_REPORT_FREQUENCIES.find((f) => f === value) ?? null;
}

/** Decide whether the info-level D1 size report is due on `now`, using the JST calendar. */
export function shouldSendD1SizeReport(frequency: D1SizeReportFrequency, now: Date): boolean {
  // Shift to JST and read with getUTC* so the result does not depend on the runtime TZ.
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  switch (frequency) {
    case 'Day':
      return true;
    case 'Week':
      return jst.getUTCDay() === 0;
    case 'Month':
      return jst.getUTCDate() === 1;
    case 'None':
      return false;
  }
}
