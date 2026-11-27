/** Displayed whole percent controls the tank and fuel popover scales. */
export const FUEL_FILL_THRESHOLDS = { healthy: 50, low: 20 } as const;
export function fuelFillColor(percent:number):string {
  return percent>FUEL_FILL_THRESHOLDS.healthy?'#39d879':percent>=FUEL_FILL_THRESHOLDS.low?'#e3cf41':'#e65151';
}
