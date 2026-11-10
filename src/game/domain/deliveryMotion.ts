import type { DeliveryTrip } from './types';

/** The service road runs along the east edge and reaches the underground tank pad. */
export function deliveryPose(trip:DeliveryTrip):{x:number;y:number;angle:number}{
  const phase=trip.phaseSeconds??0;
  const progress=trip.status==='approaching'?Math.min(1,phase/600):trip.status==='leaving'?1-Math.min(1,phase/600):
    trip.status==='enroute'||trip.status==='waiting'?0:1;
  // Centre the complete 10.4 m tanker on its 12.5 m service pad.
  const x=progress<.75?1960:1960-155*(progress-.75)/.25;
  const y=progress<.75?885-663*progress/.75:222;
  const angle=progress<.72?-Math.PI/2:progress<.78?-Math.PI/2-(progress-.72)/.06*Math.PI/2:-Math.PI;
  return {x,y,angle};
}
