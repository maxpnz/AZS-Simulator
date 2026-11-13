import { PUMP_SLOTS } from './world';
export function pumpQueuePoint(slot:number):{x:number;y:number}{
  const pump=PUMP_SLOTS[slot];
  return {x:slot===9?1740:pump.stopX+85,y:slot%2===0?755:825};
}
export const ROAD_SURFACE_RECTS = [
  [0,900,2000,140],[0,1080,2000,120],[0,850,300,50],[1900,160,100,740],[430,405,1450,175],[250,574,1650,326],
] as const;
export const ROAD_SURFACE_POLYGONS = [
  [[50,900],[300,900],[425,756],[505,574],[380,574],[170,690]],
  [[1680,574],[1805,574],[1940,900],[1730,900],[1690,710]],
] as const;
export function roadContainsPoint(x:number,y:number):boolean {
  if(ROAD_SURFACE_RECTS.some(([left,top,width,height])=>x>=left&&x<=left+width&&y>=top&&y<=top+height))return true;
  return ROAD_SURFACE_POLYGONS.some(polygon=>{
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  });
}
export interface RoadNode {id:string;x:number;y:number;next:readonly string[]}
export const ROAD_NODES:readonly RoadNode[]=[
  {id:'west_lane_1_east',x:2000,y:940,next:['entrance_decision']},
  {id:'entrance_decision',x:1850,y:940,next:['west_lane_1_west','entrance_curve']},
  {id:'west_lane_1_west',x:0,y:940,next:[]},
  {id:'west_lane_2_east',x:2000,y:1000,next:['west_lane_2_west']},
  {id:'west_lane_2_west',x:0,y:1000,next:[]},
  {id:'east_lane_1_west',x:0,y:1120,next:['east_lane_1_east']},
  {id:'east_lane_1_east',x:2000,y:1120,next:[]},
  {id:'east_lane_2_west',x:0,y:1170,next:['east_lane_2_east']},
  {id:'east_lane_2_east',x:2000,y:1170,next:[]},
  {id:'entrance_curve',x:1845,y:915,next:['entrance']},
  {id:'entrance',x:1840,y:890,next:['queue_split']},
  {id:'queue_split',x:1850,y:685,next:['exit_lane',...PUMP_SLOTS.map(s=>`pump_${s.slot+1}_approach`)]},
  ...PUMP_SLOTS.flatMap((slot)=>[
    {id:`pump_${slot.slot+1}_queue_entry`,x:pumpQueuePoint(slot.slot).x,y:890,next:[`pump_${slot.slot+1}_queue`]},
    {id:`pump_${slot.slot+1}_queue`,...pumpQueuePoint(slot.slot),next:[`pump_${slot.slot+1}_approach`]},
    {id:`pump_${slot.slot+1}_bypass`,x:pumpQueuePoint(slot.slot).x,y:890,next:['bypass_west']},
    {id:`pump_${slot.slot+1}_approach`,x:Math.min(slot.stopX+85,1810),y:685,next:[`pump_${slot.slot+1}_turn`,'exit_lane']},
    {id:`pump_${slot.slot+1}_turn`,x:slot.stopX+48,y:628,next:[`pump_${slot.slot+1}_align`]},
    {id:`pump_${slot.slot+1}_align`,x:slot.stopX+40,y:slot.stopY,next:[`pump_${slot.slot+1}`]},
    {id:`pump_${slot.slot+1}`,x:slot.stopX,y:slot.stopY,next:[`pump_${slot.slot+1}_depart`]},
    {id:`pump_${slot.slot+1}_truck_straight`,x:slot.stopX-110,y:slot.stopY,next:[`pump_${slot.slot+1}_truck_turn`]},
    {id:`pump_${slot.slot+1}_truck_turn`,x:slot.stopX-180,y:650,next:['exit_lane']},
    {id:`pump_${slot.slot+1}_depart`,x:slot.stopX-24,y:630,next:[`pump_${slot.slot+1}_clear`]},
    {id:`pump_${slot.slot+1}_clear`,x:slot.stopX-66,y:650,next:[`pump_${slot.slot+1}_merge`]},
    {id:`pump_${slot.slot+1}_merge`,x:slot.stopX-90,y:650,next:['exit_lane']},
  ]),
  {id:'queue_bypass_turn',x:1820,y:685,next:['queue_bypass']},
  {id:'queue_bypass',x:1650,y:700,next:['exit_lane']},
  {id:'bypass_west',x:0,y:890,next:[]},
  {id:'exit_lane',x:320,y:650,next:['exit']},
  {id:'exit',x:190,y:850,next:['exit_merge']},
  {id:'exit_merge',x:110,y:940,next:['west_lane_1_west']},
  {id:'truck_exit_lane',x:320,y:700,next:['truck_exit']},
  {id:'truck_exit',x:190,y:800,next:['truck_exit_merge']},
  {id:'truck_exit_merge',x:80,y:940,next:['west_lane_1_west']},
];
