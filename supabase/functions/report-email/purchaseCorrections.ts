export function purchaseCorrections(
  current: Record<string, number | null>,
  previous: Record<string, number | null> | undefined,
  previousDate: string,
) {
  if (!previous) return [];
  return Object.entries(previous).flatMap(([date, old]) => {
    if (!(date in current) || date > previousDate) return [];
    const value = current[date];
    if (value === old) return [];
    const difference = old == null || value == null ? null : Math.round((value - old) * 100) / 100;
    if (difference !== null && Math.abs(difference) < 0.01) return [];
    return [{ date, previous: old, current: value, difference }];
  });
}