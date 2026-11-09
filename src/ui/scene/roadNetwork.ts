/** World coordinates in the 2000 × 1200 scene. Traffic is not active in v0.2-A. */
export interface RoadNode { id:string; x:number; y:number; next:readonly string[] }
export const ROAD_NODES:readonly RoadNode[]=[
  {id:'east_lane_1_west',x:0,y:785,next:['entrance_decision']},
  {id:'entrance_decision',x:260,y:785,next:['east_lane_1_east','entrance_curve']},
  {id:'east_lane_1_east',x:2000,y:785,next:[]},
  {id:'east_lane_2_west',x:0,y:850,next:['east_lane_2_east']},
  {id:'east_lane_2_east',x:2000,y:850,next:[]},
  {id:'west_lane_1_east',x:2000,y:985,next:['west_lane_1_west']},
  {id:'west_lane_1_west',x:0,y:985,next:[]},
  {id:'west_lane_2_east',x:2000,y:1050,next:['west_lane_2_west']},
  {id:'west_lane_2_west',x:0,y:1050,next:[]},
  {id:'entrance_curve',x:405,y:755,next:['entrance']},
  {id:'entrance',x:480,y:640,next:['queue_split']},
  {id:'queue_split',x:615,y:600,next:['pump_1_approach','pump_2_approach','exit_lane']},
  {id:'pump_1_approach',x:760,y:600,next:['pump_1','exit_lane']},
  {id:'pump_1',x:770,y:545,next:['exit_lane']},
  {id:'pump_2_approach',x:1250,y:600,next:['pump_2','exit_lane']},
  {id:'pump_2',x:1260,y:545,next:['exit_lane']},
  {id:'exit_lane',x:1600,y:600,next:['exit']},
  {id:'exit',x:1740,y:660,next:['exit_merge']},
  {id:'exit_merge',x:1860,y:785,next:['east_lane_1_east']},
];
