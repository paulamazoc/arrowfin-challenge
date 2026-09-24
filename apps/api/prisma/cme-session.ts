/**
 * Maps a UTC fill timestamp to the CME Globex session open date in America/Chicago.
 * Session opens at 17:00 US Central; earlier timestamps belong to the previous calendar date.
 *
 * This is sufficient for the assessment dataset. Production trading-calendar logic would
 * require exchange holidays, early closes, and a dedicated calendar service.
 */
export function deriveSessionDate(filledAtUtc: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(filledAtUtc);

  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Unable to read ${type} for session date`);
    }
    return Number(value);
  };

  let year = read('year');
  let month = read('month');
  let day = read('day');
  const hour = read('hour');

  if (hour < 17) {
    const previous = new Date(Date.UTC(year, month - 1, day));
    previous.setUTCDate(previous.getUTCDate() - 1);
    year = previous.getUTCFullYear();
    month = previous.getUTCMonth() + 1;
    day = previous.getUTCDate();
  }

  return new Date(Date.UTC(year, month - 1, day));
}
