import { Container, Graphics, Text } from 'pixi.js';
import type { Vehicle } from '../../game/domain/types';
import { modelById } from '../../game/domain/vehicleModels';
import { metres } from '../../game/domain/world';

export interface VehicleVisual { root: Container; update: (vehicle: Vehicle) => void }
function tint(color:number, fraction:number) {
  const c=(shift:number)=>Math.max(0,Math.min(255,Math.round(((color>>shift)&255)*fraction)));
  return (c(16)<<16)|(c(8)<<8)|c(0);
}
/** Every silhouette is built from its real length and width, then projected in the same view. */
export function createVehicleVisual(vehicle: Vehicle): VehicleVisual {
  const model=modelById(vehicle.modelId), length=metres(model.length), width=metres(model.width);
  const root=new Container();
  const shadow=new Graphics().ellipse(5,8,length*.52,width*.48).fill({color:0x071317,alpha:.35});root.addChild(shadow);
  const body=new Graphics();
  const bodyColor=vehicle.color;
  const passengerProfile:Record<string,{front:number;rear:number;roof:number;nose:number;tail:number}>={
    'city-hatch':{front:.17,rear:-.37,roof:.39,nose:.31,tail:.40},
    'budget-sedan':{front:.16,rear:-.18,roof:.35,nose:.35,tail:.34},
    'family-sedan':{front:.18,rear:-.19,roof:.36,nose:.34,tail:.35},
    'business-sedan':{front:.12,rear:-.18,roof:.34,nose:.32,tail:.31},
    'estate-wagon':{front:.19,rear:-.36,roof:.38,nose:.34,tail:.43},
    'compact-crossover':{front:.21,rear:-.26,roof:.38,nose:.35,tail:.39},
    'mid-suv':{front:.22,rear:-.33,roof:.40,nose:.38,tail:.43},
    'full-suv':{front:.24,rear:-.38,roof:.42,nose:.40,tail:.45},
    'minivan':{front:.34,rear:-.39,roof:.42,nose:.40,tail:.44},
    'sport-coupe':{front:.07,rear:-.11,roof:.31,nose:.25,tail:.27},
  };
  const profile=passengerProfile[model.id];
  if(profile){
    body.poly([-length*.5,-width*profile.tail,-length*.42,-width*.49,length*.38,-width*.49,length*.5,-width*profile.nose,
      length*.5,width*profile.nose,length*.38,width*.49,-length*.42,width*.49,-length*.5,width*profile.tail])
      .fill(bodyColor).stroke({color:tint(bodyColor,.55),width:2});
    body.poly([-length*.44,width*.38,length*.40,width*.38,length*.38,width*.48,-length*.42,width*.48])
      .fill({color:tint(bodyColor,.65),alpha:.75});
  } else body.roundRect(-length/2,-width/2,length,width,Math.min(14,width*.25)).fill(bodyColor)
    .roundRect(-length*.41,-width*.35,length*.82,width*.7,8).stroke({color:tint(bodyColor,.56),width:2});
  const cabinFront=profile?.front??(model.silhouette==='box'||model.silhouette==='bus'?.34:.18);
  const cabinRear=profile?.rear??(model.silhouette==='wagon'||model.silhouette==='van'||model.silhouette==='bus'?-.34:-.17);
  if(model.silhouette==='tanker') {
    body.roundRect(-length*.35,-width*.38,length*.65,width*.76,width*.34).fill(0xc8d7dc).stroke({color:0x50666d,width:2});
    body.roundRect(length*.22,-width*.38,length*.22,width*.76,5).fill(bodyColor);
    for(let x=-length*.23;x<length*.22;x+=length*.17) body.moveTo(x,-width*.3).lineTo(x,width*.3).stroke({color:0x7d979e,width:2});
  } else if(model.silhouette==='box'||model.silhouette==='tractor') {
    body.roundRect(-length*.46,-width*.43,length*.64,width*.86,4).fill(0xdce4e1).stroke({color:0x51636b,width:2});
    body.roundRect(length*.18,-width*.42,length*.27,width*.84,4).fill(bodyColor);
  } else if(model.silhouette==='pickup') {
    body.roundRect(-length*.45,-width*.39,length*.38,width*.78,3).fill(tint(bodyColor,.65));
    body.roundRect(-length*.06,-width*.35,length*.34,width*.7,5).fill(0x263f4c);
  } else {
    const roof=profile?.roof??.37;
    body.poly([length*cabinRear,-width*roof,length*cabinFront,-width*roof,length*(cabinFront+.07),-width*.16,
      length*(cabinFront+.07),width*.16,length*cabinFront,width*roof,length*cabinRear,width*roof,
      length*(cabinRear-.06),width*.15,length*(cabinRear-.06),-width*.15]).fill(0x273f4a)
      .stroke({color:0x91a9ad,width:1.5});
    body.moveTo(length*cabinFront,-width*roof).lineTo(length*cabinFront,width*roof).stroke({color:0xb5d1d9,width:2});
    if(model.silhouette==='sedan'||model.silhouette==='wagon'||model.silhouette==='suv')
      body.moveTo(length*cabinRear,-width*roof).lineTo(length*cabinRear,width*roof).stroke({color:0xb5d1d9,width:2});
    if(model.silhouette==='suv'||model.silhouette==='wagon'||model.silhouette==='van')for(const side of [-1,1])
      body.moveTo(length*(cabinRear+.04),side*width*(roof+.035)).lineTo(length*(cabinFront-.03),side*width*(roof+.035))
        .stroke({color:0xd9d9cb,width:2});
    if(model.id==='sport-coupe')body.poly([length*.34,-width*.26,length*.48,-width*.15,length*.48,width*.15,length*.34,width*.26])
      .fill({color:tint(bodyColor,.78),alpha:.8});
  }
  for(const side of [-1,1]) {
    body.roundRect(-length*.34,side*width*.43-4,length*.18,8,2).fill(0x17252a);
    body.roundRect(length*.22,side*width*.43-4,length*.18,8,2).fill(0x17252a);
    body.roundRect(length*.44,side*width*.26-3,6,6,2).fill(0xfff2bf);
    body.roundRect(-length*.49,side*width*.26-3,5,6,2).fill(0xd64c42);
  }
  root.addChild(body);
  const progress=new Graphics();progress.y=-width*.72;root.addChild(progress);
  const amount=new Text({text:'',style:{fontFamily:'Arial',fontSize:13,fontWeight:'bold',fill:0xffffff,stroke:{color:0x102027,width:3}}});
  amount.anchor.set(.5);amount.y=-width*.9;root.addChild(amount);
  return {root,update(next) {
    root.position.set(next.x,next.y);root.rotation=next.angle;
    const filling=(next.status==='fueling'||next.status==='finishing')&&next.deliveredMl>0;
    progress.visible=filling;amount.visible=filling;
    if(filling) {
      const ratio=next.reservedMl?Math.min(1,next.deliveredMl/next.reservedMl):0;
      progress.clear().roundRect(-31,-4,62,8,3).fill(0x142329).roundRect(-29,-2,58*ratio,4,2).fill(0x72e3a3);
      amount.text=(next.deliveredMl/1000).toFixed(1)+' л';
    }
  }};
}
