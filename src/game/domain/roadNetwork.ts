import { PUMP_SLOTS } from './world';
export interface RoadNode {id:string;x:number;y:number;next:readonly string[]}
export const ROAD_NODES:readonly RoadNode[]=[
  {id:'east_lane_1_west',x:0,y:885,next:['entrance_decision']},
  {id:'entrance_decision',x:150,y:885,next:['east_lane_1_east','entrance_curve']},
  {id:'east_lane_1_east',x:2000,y:885,next:[]},
  {id:'east_lane_2_west',x:0,y:975,next:['east_lane_2_east']},
  {id:'east_lane_2_east',x:2000,y:975,next:[]},
  {id:'west_lane_1_east',x:2000,y:1105,next:['west_lane_1_west']},
  {id:'west_lane_1_west',x:0,y:1105,next:[]},
  {id:'west_lane_2_east',x:2000,y:1170,next:['west_lane_2_west']},
  {id:'west_lane_2_west',x:0,y:1170,next:[]},
  {id:'entrance_curve',x:225,y:805,next:['entrance']},
  {id:'entrance',x:280,y:735,next:['queue_split']},
  {id:'queue_split',x:365,y:685,next:['exit_lane',...PUMP_SLOTS.map(s=>`pump_${s.slot+1}_approach`)]},
  ...PUMP_SLOTS.flatMap((slot)=>[
    {id:`pump_${slot.slot+1}_approach`,x:slot.stopX,y:685,next:[`pump_${slot.slot+1}`,'exit_lane']},
    {id:`pump_${slot.slot+1}`,x:slot.stopX,y:slot.stopY,next:[`pump_${slot.slot+1}_depart`]},
    {id:`pump_${slot.slot+1}_depart`,x:slot.stopX,y:735,next:['exit_lane']},
  ]),
  {id:'queue_bypass',x:650,y:735,next:['exit_lane']},
  {id:'exit_lane',x:1740,y:735,next:['exit']},
  {id:'exit',x:1810,y:735,next:['exit_merge']},
  {id:'exit_merge',x:1880,y:885,next:['east_lane_1_east']},
];
