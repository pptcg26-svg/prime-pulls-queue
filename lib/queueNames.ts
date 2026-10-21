// Keep only one letter, even if a caller supplies a full surname.
export function toLastInitial(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const letter = value.trim().match(/\p{L}/u)?.[0];
  return letter ? Array.from(letter.toLocaleUpperCase('en-US'))[0] : null;
}

export function queueDisplayName(order: { first_name: string; last_initial?: string | null }) {
  const initial = toLastInitial(order.last_initial);
  return `${order.first_name}${initial ? ` ${initial}.` : ''}`;
}
