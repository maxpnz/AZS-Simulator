import { VEHICLE_MODELS } from '../../game/domain/vehicleModels';

const urls = import.meta.glob('../../assets/v052/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string,string>;
const dimensions: Record<string, readonly [number,number]> = {
  'city-hatch':[640,341], 'budget-sedan':[640,332], 'family-sedan':[640,317],
  'business-sedan':[640,304], 'estate-wagon':[640,302], 'compact-crossover':[640,371],
  'mid-suv':[640,321], 'full-suv':[640,320], 'minivan':[640,325],
  'sport-coupe':[640,336], 'pickup':[640,285], 'delivery-van':[640,268],
  'medium-truck':[960,426], 'heavy-truck':[960,317], 'coach-bus':[960,277],
  'semi-trailer':[960,234], 'fuel-tanker':[960,331],
};
/** Fixed body colors are intentional; the simulation retains its vehicle color value. */
export const VEHICLE_SPRITES = VEHICLE_MODELS.map(model => {
  const path = Object.keys(urls).find(key => key.endsWith(`_${model.id}.png`));
  if (!path) throw new Error(`Missing v0.5.2 vehicle sprite: ${model.id}`);
  return {modelId:model.id,path,url:urls[path],pixelWidth:dimensions[model.id][0],pixelHeight:dimensions[model.id][1],
    orientation:'right' as const,anchor:{x:.5,y:.5},scale:1};
});
