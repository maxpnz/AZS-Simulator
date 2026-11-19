/** Displayed whole percent controls the tank and fuel popover scales. */
export function fuelFillColor(percent:number):string {
  return percent>50?'#39d879':percent>25?'#e3cf41':percent>10?'#f29837':'#e65151';
}
