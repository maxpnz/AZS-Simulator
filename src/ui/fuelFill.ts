/** Displayed whole percent controls the tank and fuel popover scales. */
export const FUEL_FILL_THRESHOLDS = { healthy: 50, low: 20 } as const;
export function fuelFillColor(percent:number):string {
  return percent>FUEL_FILL_THRESHOLDS.healthy?'#39d879':percent>=FUEL_FILL_THRESHOLDS.low?'#e3cf41':'#e65151';
}

/** Colour ramp used only by the top-bar reservoir popover. */
export function reservoirPopoverColor(percent:number):string {
  const stops=[[0,0xe34c4c],[10,0xe34c4c],[25,0xed963b],[50,0xe5ce42],[75,0x91cc43],[100,0x42c76b]] as const;
  const value=Math.max(0,Math.min(100,Number.isFinite(percent)?percent:0));
  for(let i=1;i<stops.length;i++)if(value<=stops[i][0]){
    const [low,a]=stops[i-1],[high,b]=stops[i],ratio=(value-low)/(high-low);
    const channel=(shift:number)=>Math.round(((a>>shift)&255)*(1-ratio)+((b>>shift)&255)*ratio);
    return `#${[channel(16),channel(8),channel(0)].map(n=>n.toString(16).padStart(2,'0')).join('')}`;
  }
  return '#42c76b';
}
