import { SKU, type CommerceOrder, type Sku } from './commerce';

export const GOODS_DRIVE_SECONDS = 600;
const route = [[1960, 885], [1960, 132], [1933, 79], [1570, 79]] as const;

export function goodsUnloadSeconds(order: CommerceOrder): number {
  const space = Object.entries(order.lines).reduce((sum, [sku, line]) => sum + SKU[sku as Sku].size * line.quantity, 0);
  return 60 * Math.max(1, Math.ceil(space / 25));
}

export function goodsDeliveryActive(order: CommerceOrder): boolean {
  return order.status === 'approaching' || order.status === 'unloading' || order.status === 'leaving';
}

export function goodsPose(order: CommerceOrder) {
  const progress = Math.min(1, (order.phaseSeconds ?? 0) / GOODS_DRIVE_SECONDS);
  const fraction = order.status === 'approaching' ? progress : order.status === 'leaving' ? 1 - progress : 1;
  let distance = fraction * (753 + Math.hypot(27, 53) + 363);
  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i - 1];
    const [nextX, nextY] = route[i];
    const length = Math.hypot(nextX - x, nextY - y);
    if (distance <= length || i === route.length - 1) {
      const t = Math.min(1, distance / length);
      // Reverse out of the bay and keep the cab facing the loading dock.
      return { x: x + t * (nextX - x), y: y + t * (nextY - y), angle: Math.atan2(nextY - y, nextX - x) };
    }
    distance -= length;
  }
  throw new Error('Missing goods delivery route');
}
