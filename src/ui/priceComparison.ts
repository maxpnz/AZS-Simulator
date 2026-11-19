/** Price difference from the reference price, in percent. Missing prices are not comparable. */
export function priceDifference(ours: number | undefined, reference: number | undefined): number | null {
  if (ours === undefined || reference === undefined || !Number.isFinite(ours) || !Number.isFinite(reference) || reference <= 0) return null;
  return (ours - reference) / reference * 100;
}

export function formatPriceDifference(value: number | null): string {
  if (value === null) return 'Нет данных';
  if (Math.abs(value) < 0.05) return '0%';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function priceDifferenceClass(value: number | null): string {
  return value === null || Math.abs(value) < 0.05 ? 'price-neutral' : value < 0 ? 'price-below' : 'price-above';
}
