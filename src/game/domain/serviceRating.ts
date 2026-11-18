import type {TrafficStats} from './types';
/** A score from actual fuel-service outcomes. Returns null before any outcome exists. */
export function serviceRating(stats:Pick<TrafficStats,'purchases'|'unserved'|'leftQueue'>):number|null {
  const attempts=stats.purchases+stats.unserved+stats.leftQueue;
  if(attempts<=0)return null;
  return Math.round(50*stats.purchases/attempts)/10;
}
