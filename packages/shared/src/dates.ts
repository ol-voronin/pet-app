/** Today's calendar date in Kyiv as `YYYY-MM-DD` (dates are shown in Europe/Kyiv, CLAUDE.md). */
export function kyivToday(now: Date = new Date()): string {
  // Older devices know the zone only under its previous name.
  for (const timeZone of ['Europe/Kyiv', 'Europe/Kiev']) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      // Unknown zone name on this device: try the next one.
    }
  }
  return now.toISOString().slice(0, 10);
}

/** The same calendar day `years` earlier; 29 February becomes 28 February in a common year. */
export function yearsBefore(date: string, years: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const year = y - years;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
