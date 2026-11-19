import { describe, expect, it } from 'vitest';
import { formatPriceDifference, priceDifference, priceDifferenceClass } from './priceComparison';

describe('price comparison', () => {
  it('uses the reference as the denominator and keeps signs consistent', () => {
    expect(priceDifference(90, 100)).toBe(-10);
    expect(priceDifference(110, 100)).toBe(10);
    expect(formatPriceDifference(priceDifference(90, 100))).toBe('−10,0%');
    expect(priceDifferenceClass(priceDifference(90, 100))).toBe('price-below');
    expect(priceDifferenceClass(priceDifference(110, 100))).toBe('price-above');
  });
  it('does not invent a comparison for a missing or zero reference', () => {
    expect(priceDifference(100, 0)).toBeNull();
    expect(priceDifference(100, undefined)).toBeNull();
    expect(formatPriceDifference(null)).toBe('Нет данных');
  });
});
