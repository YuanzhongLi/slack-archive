export const ARCHIVE_CUTOFF_DAYS = 91;

export function cutoffIso(): string {
  return new Date(Date.now() - ARCHIVE_CUTOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
