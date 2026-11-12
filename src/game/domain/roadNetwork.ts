import { PUMP_SLOTS } from './world';
export const ROAD_SURFACE_RECTS = [
  [0,840,2000,360],[1900,160,100,680],[430,405,1450,175],[270,574,1630,182],
] as const;
export const ROAD_SURFACE_POLYGONS = [
  [[50,840],[300,840],[425,756],[505,574],[380,574],[170,690]],
  [[1680,574],[1805,574],[1940,840],[1730,840],[1690,710]],
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
  {id:'west_lane_1_east',x:2000,y:885,next:['entrance_decision']},
  {id:'entrance_decision',x:1850,y:885,next:['west_lane_1_west','entrance_curve']},
  {id:'west_lane_1_west',x:0,y:885,next:[]},
  {id:'west_lane_2_east',x:2000,y:975,next:['west_lane_2_west']},
  {id:'west_lane_2_west',x:0,y:975,next:[]},
  {id:'east_lane_1_west',x:0,y:1105,next:['east_lane_1_east']},
  {id:'east_lane_1_east',x:2000,y:1105,next:[]},
  {id:'east_lane_2_west',x:0,y:1170,next:['east_lane_2_east']},
  {id:'east_lane_2_east',x:2000,y:1170,next:[]},
  {id:'entrance_curve',x:1845,y:850,next:['entrance']},
  {id:'entrance',x:1840,y:820,next:['queue_split']},
  {id:'queue_split',x:1850,y:685,next:['exit_lane',...PUMP_SLOTS.map(s=>`pump_${s.slot+1}_approach`)]},
  ...PUMP_SLOTS.flatMap((slot)=>[
    {id:`pump_${slot.slot+1}_approach`,x:Math.min(slot.stopX+85,1810),y:685,next:[`pump_${slot.slot+1}_turn`,'exit_lane']},
    {id:`pump_${slot.slot+1}_turn`,x:slot.stopX+48,y:628,next:[`pump_${slot.slot+1}_align`]},
    {id:`pump_${slot.slot+1}_align`,x:slot.stopX+40,y:slot.stopY,next:[`pump_${slot.slot+1}`]},
    {id:`pump_${slot.slot+1}`,x:slot.stopX,y:slot.stopY,next:[`pump_${slot.slot+1}_depart`]},
    {id:`pump_${slot.slot+1}_truck_straight`,x:slot.stopX-110,y:slot.stopY,next:[`pump_${slot.slot+1}_truck_turn`]},
    {id:`pump_${slot.slot+1}_truck_turn`,x:slot.stopX-180,y:700,next:['exit_lane']},
    {id:`pump_${slot.slot+1}_depart`,x:slot.stopX-24,y:630,next:[`pump_${slot.slot+1}_clear`]},
    {id:`pump_${slot.slot+1}_clear`,x:slot.stopX-66,y:685,next:[`pump_${slot.slot+1}_merge`]},
    {id:`pump_${slot.slot+1}_merge`,x:slot.stopX-90,y:700,next:['exit_lane']},
  ]),
  {id:'queue_bypass_turn',x:1820,y:685,next:['queue_bypass']},
  {id:'queue_bypass',x:1650,y:700,next:['exit_lane']},
  {id:'exit_lane',x:320,y:700,next:['exit']},
  {id:'exit',x:190,y:800,next:['exit_merge']},
  {id:'exit_merge',x:110,y:885,next:['west_lane_1_west']},
];
