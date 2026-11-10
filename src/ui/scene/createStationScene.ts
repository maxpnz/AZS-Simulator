import { Assets, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { ConstructionJob, DeliveryTrip, FuelId, FuelTank, Pump, Vehicle } from '../../game/domain/types';
import { CANOPY_SUPPORTS, PUMP_SLOTS, ROAD_LANES, WORLD_OBSTACLES } from '../../game/domain/world';
import { deliveryPose } from '../../game/domain/deliveryMotion';
import { getHour } from '../../game/simulation/time';
import { createVehicleVisual, type VehicleVisual } from './vehicleSprite';
import grassUrl from '../../assets/v025/grass.webp';
import asphaltUrl from '../../assets/v025/asphalt.webp';
import storeUrl from '../../assets/v025/store.webp';
import canopyUrl from '../../assets/v025/canopy.webp';
import pumpUrl from '../../assets/v025/pump.webp';
import flowerbedUrl from '../../assets/v025/flowerbed.webp';
import landscapeLampUrl from '../../assets/v025/landscape-lamp.webp';
import passengerAtlasUrl from '../../assets/v025/passenger-atlas.webp';
import commercialAtlasUrl from '../../assets/v025/commercial-atlas.webp';
import pickupUrl from '../../assets/v025/pickup.webp';
import tankHatchUrl from '../../assets/v025/tank-hatch.webp';
import priceSignUrl from '../../assets/v025/price-sign.webp';
import { setVehicleTextures } from './vehicleSprite';

export const SCENE_WIDTH=2000, SCENE_HEIGHT=1200;
export type ObjectId='price-sign'|'tank'|'shop'|'delivery'|'expansion'|`pump-${number}`|`slot-${number}`;
export interface Hotspot { id:ObjectId; polygon:readonly [number,number][] }
const box=(id:ObjectId,x:number,y:number,w:number,h:number):Hotspot=>({id,polygon:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]});
export const HOTSPOTS:readonly Hotspot[]=[
  box('price-sign',145,280,125,270),box('tank',1310,170,360,155),box('shop',475,95,670,280),
  box('delivery',1660,160,270,160),box('expansion',1050,380,230,70),
  ...PUMP_SLOTS.map((slot)=>box(`slot-${slot.slot}`,slot.x-36,slot.y-43,72,94)),
];
export function hitTest(x:number,y:number):ObjectId|null {
  for(const {id,polygon} of [...HOTSPOTS].reverse()) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    if(inside)return id;
  }
  return null;
}
function label(value:string,x:number,y:number,size=17,color=0xf4f5e9) {
  const t=new Text({text:value,style:{fontFamily:'Arial',fontSize:size,fontWeight:'bold',fill:color,align:'center',stroke:{color:0x15212a,width:3}}});t.anchor.set(.5);t.position.set(x,y);return t;
}
function shape(root:Container,draw:(g:Graphics)=>void) {const g=new Graphics();draw(g);root.addChild(g);return g;}
function asphalt(root:Container,x:number,y:number,w:number,h:number) {shape(root,g=>g.rect(x,y,w,h).fill(0x38444a).rect(x,y,w,4).fill({color:0x718087,alpha:.34}));}
function image(root:Container,texture:Texture,x:number,y:number,w:number,h:number) {const sprite=new Sprite(texture);sprite.position.set(x,y);sprite.width=w;sprite.height=h;root.addChild(sprite);return sprite;}
function pumpGraphic(pump:Pump,vehicles:readonly Vehicle[],stock:Record<FuelId,number>,texture:Texture) {
  const slot=PUMP_SLOTS[pump.slot];const root=new Container();root.position.set(slot.x,slot.y);
  const g=new Graphics();root.addChild(g);
  g.ellipse(4,20,25,9).fill({color:0x071519,alpha:.4});
  g.roundRect(-23,11,46,14,3).fill(0x879397);
  image(root,texture,-33,-73,66,89);
  g.roundRect(-16,-55,32,28,2).fill({color:0x101b22,alpha:.92}).stroke({color:0x9eb9bd,width:1});
  const display=new Text({text:'',style:{fontFamily:'monospace',fontSize:6,fontWeight:'bold',fill:0xc7f3df,align:'right',lineHeight:7}});display.anchor.set(.5);display.position.set(0,-41);root.addChild(display);
  const tags:Text[]=[];
  pump.fuels.slice(0,4).forEach((fuel,index)=>{
    const x=-12+index*8;
    g.moveTo(x,-20).bezierCurveTo(x-14,-12,x-13,23,x-6,20).stroke({color:0x111b20,width:3});
    g.roundRect(x-9,6,5,16,1).fill(stock[fuel]>0?0x202b30:0x8d3333);
    const t=new Text({text:stock[fuel]>0?({ai92:'АИ-92',ai95:'АИ-95',ai95plus:'АИ-95+',ai98:'АИ-98',ai100:'АИ-100',diesel:'ДТ'} as Record<FuelId,string>)[fuel]:'НЕТ ТОПЛИВА',
      style:{fontFamily:'Arial',fontSize:8,fontWeight:'bold',fill:0xffffff,stroke:{color:0x15212a,width:2}}});
    t.anchor.set(slot.side==='left'?1:0,.5);t.position.set(slot.side==='left'?-35:35,-31+12*index);root.addChild(t);tags.push(t);
  });
  const active=vehicles.find(v=>v.pumpId===pump.id&&(v.status==='fueling'||v.status==='finishing'));
  const price=active?.salePriceKopeks??0;
  display.text=active ? `${(active.deliveredMl/1000).toFixed(2)} л\n${(active.chargedKopeks/100).toFixed(2)} ₽\n${(price/100).toFixed(2)} ₽/л` : '0.00 л\n0.00 ₽\nГОТОВА';
  return {root,display,tags,active};
}
export interface StationScene {root:Container;setTime:(seconds:number)=>void;setPrices:(prices:Record<FuelId,number>)=>void;setVehicles:(vehicles:readonly Vehicle[])=>void;setPumps:(pumps:readonly Pump[],stocks:Record<FuelId,number>,jobs?:readonly ConstructionJob[],tanks?:readonly FuelTank[])=>void;setDeliveries:(deliveries:readonly DeliveryTrip[])=>void;tick:(elapsedMs:number)=>void}
export async function createStationScene(initialPumps:readonly Pump[]):Promise<StationScene> {
  const [grassTexture,asphaltTexture,storeTexture,canopyTexture,pumpTexture,flowerbedTexture,landscapeLampTexture,passengerAtlas,commercialAtlas,pickupTexture,tankHatchTexture,priceSignTexture]=
    await Promise.all([grassUrl,asphaltUrl,storeUrl,canopyUrl,pumpUrl,flowerbedUrl,landscapeLampUrl,passengerAtlasUrl,commercialAtlasUrl,pickupUrl,tankHatchUrl,priceSignUrl].map(url=>Assets.load<Texture>(url)));
  setVehicleTextures(passengerAtlas,commercialAtlas,pickupTexture);
  const root=new Container();
  const grass=new TilingSprite({texture:grassTexture,width:SCENE_WIDTH,height:SCENE_HEIGHT});grass.tileScale.set(.42);root.addChild(grass);
  const ground=new Container();root.addChild(ground);
  asphalt(ground,0,840,2000,360);
  asphalt(ground,1900,160,100,680);
  shape(ground,g=>g.rect(1910,160,3,680).fill({color:0xe9e3c9,alpha:.6}));
  asphalt(ground,430,405,1450,175);
  asphalt(ground,270,574,1580,182);
  shape(ground,g=>g.poly([115,840,300,840,425,756,505,574,380,574,195,705]).fill(0x38444a)
    .poly([1680,574,1805,574,1940,840,1730,840,1690,710]).fill(0x38444a));
  const roadMask=new Graphics().rect(0,840,2000,360).rect(1900,160,100,680).rect(430,405,1450,175).rect(270,574,1580,182)
    .poly([115,840,300,840,425,756,505,574,380,574,195,705])
    .poly([1680,574,1805,574,1940,840,1730,840,1690,710]).fill(0xffffff);
  const roadSurface=new TilingSprite({texture:asphaltTexture,width:SCENE_WIDTH,height:SCENE_HEIGHT});
  roadSurface.tileScale.set(.46);roadSurface.mask=roadMask;ground.addChild(roadSurface,roadMask);
  for(const y of ROAD_LANES) {
    const dash=new Graphics();for(let x=15;x<2000;x+=75)dash.rect(x,y+(y<1000?32:-31),37,3).fill({color:0xe8e3c8,alpha:.76});ground.addChild(dash);
  }
  shape(ground,g=>g.rect(0,1032,2000,8).fill(0xd2be70).rect(0,1040,2000,8).fill(0x343e40));
  shape(ground,g=>g.rect(275,565,1540,9).fill(0xb8bbb1).rect(270,756,1600,8).fill(0xa9afa5));
  for(const x of [350,1860]) ground.addChild(label(x<1000?'ВЪЕЗД':'ВЫЕЗД',x,719,18));
  for(const x of [570,820,1070,1320,1570]) shape(ground,g=>g.poly([x,697,x+30,682,x,667]).fill({color:0xe9e8d4,alpha:.8}));
  // The planted beds, shop, tanks and service pad are separate scene objects.
  for(const obstacle of WORLD_OBSTACLES.filter(o=>o.id.startsWith('flower'))) {
    image(root,flowerbedTexture,obstacle.x-10,obstacle.y-26,obstacle.width+20,obstacle.height+54);
  }
  image(root,storeTexture,455,8,760,390);
  root.addChild(label('МАРКЕТ  •  АЗС',800,220,27));
  shape(root,g=>g.roundRect(1300,170,375,155,14).fill(0x485155).stroke({color:0xb9b5a5,width:5})
    .roundRect(1315,185,345,125,8).stroke({color:0x717e7a,width:2}));
  const tankLayer=new Container();root.addChild(tankLayer);
  shape(root,g=>g.roundRect(1660,160,270,160,10).fill(0x566365).stroke({color:0xc6c1a7,width:4})
    .roundRect(1680,177,228,118,7).fill(0x66777a).stroke({color:0x839495,width:2})
    .circle(1822,256,19).fill(0x9daaa6).circle(1822,256,10).fill(0x42565b));
  root.addChild(label('СЛИВ ТОПЛИВА',1795,304,15));
  image(root,landscapeLampTexture,8,280,340,170);
  image(root,landscapeLampTexture,1550,330,340,170);
  for(const x of [280,475,1820,1900]) {
    shape(root,g=>g.ellipse(x+8,590,26,12).fill({color:0x162b2d,alpha:.3}).rect(x-4,390,8,195).fill(0x788a89).circle(x,388,13).fill(0xece6b4));
  }
  // A light canopy roof is drawn behind supports and dispensers so every channel remains visible.
  image(root,canopyTexture,530,180,1300,435);
  root.addChild(label('АЗС SIMULATOR',1160,432,22));
  for(const x of CANOPY_SUPPORTS) {
    shape(root,g=>g.ellipse(x+7,548,29,13).fill({color:0x15252b,alpha:.35}).rect(x-11,452,22,96).fill(0xdee2dc).rect(x-11,452,5,96).fill(0x99a9aa));
  }
  const sign=new Container();sign.position.set(207,398);root.addChild(sign);
  image(sign,priceSignTexture,-58,-125,116,260);
  const signText=new Text({text:'',style:{fontFamily:'Arial',fontSize:13,fontWeight:'bold',fill:0xf1eee1,align:'center',lineHeight:37,stroke:{color:0x10171d,width:2}}});signText.anchor.set(.5);signText.y=-45;sign.addChild(signText);
  const pumpLayer=new Container(),vehicleLayer=new Container(),effectLayer=new Container(),deliveryLayer=new Container();root.addChild(pumpLayer,vehicleLayer,effectLayer,deliveryLayer);
  const visuals=new Map<number,VehicleVisual>();
  const motions=new Map<number,{root:Container;fromX:number;fromY:number;toX:number;toY:number;fromAngle:number;toAngle:number;elapsed:number}>();let vehicles:readonly Vehicle[]=[];let pumps:readonly Pump[]=initialPumps;let stocks={} as Record<FuelId,number>;let jobs:readonly ConstructionJob[]=[];let tanks:readonly FuelTank[]=[];
  let pumpSignature='';const displays=new Map<string,Text>();
  const fuelNames:Record<FuelId,string>={ai92:'92',ai95:'95',ai95plus:'95+',ai98:'98',ai100:'100',diesel:'ДТ'};
  function drawTanks(){
    tankLayer.removeChildren().forEach(child=>child.destroy({children:true}));
    tanks.forEach((tank,index)=>{
      const x=1350+(index%4)*96,y=220+Math.floor(index/4)*75;
      const hatch=image(tankLayer,tankHatchTexture,x-47,y-43,94,86);
      hatch.alpha=tank.status==='active'?1:.58;
      tankLayer.addChild(label(fuelNames[tank.fuel],x,y+34,12));
      const job=jobs.find(j=>j.targetId===tank.id);
      if(job)tankLayer.addChild(label(`${Math.round(100*(1-job.remainingSeconds/job.totalSeconds))}%`,x,y-26,11,0xffe1a1));
    });
  }
  function drawPumps(){
    const signature=pumps.map(p=>`${p.id}:${p.slot}:${p.status}:${p.fuels.join(',')}`).join('|')+'@'+Object.keys(stocks).map(k=>`${k}:${stocks[k as FuelId]>0}`).join(',')+'#'+jobs.map(j=>`${j.targetId}:${Math.round(j.remainingSeconds)}`).join(',');
    if(signature!==pumpSignature){
      pumpSignature=signature;displays.clear();pumpLayer.removeChildren().forEach(child=>child.destroy({children:true}));
      for(const slot of PUMP_SLOTS){
        const pump=pumps.find(p=>p.slot===slot.slot);
        if(pump?.status==='building'){
          shape(pumpLayer,g=>g.roundRect(slot.x-36,slot.y-28,72,60,3).fill({color:0xb98d44,alpha:.35}).stroke({color:0xf5d38a,width:4})
            .moveTo(slot.x-32,slot.y-25).lineTo(slot.x+32,slot.y+29).stroke({color:0xe7d19a,width:3}));
          const job=jobs.find(j=>j.targetId===pump.id);
          pumpLayer.addChild(label(job?`${Math.round(100*(1-job.remainingSeconds/job.totalSeconds))}%`:'СТРОЙКА',slot.x,slot.y+42,12,0xffe4a4));
        }else if(pump){
          const visual=pumpGraphic(pump,vehicles,stocks,pumpTexture);pumpLayer.addChild(visual.root);displays.set(pump.id,visual.display);
          if(pump.status==='upgrading')pumpLayer.addChild(label('МОНТАЖ',slot.x,slot.y+63,11,0xffd897));
        }else shape(pumpLayer,g=>g.roundRect(slot.x-24,slot.y+14,48,15,4).fill(0x9aa6a2).stroke({color:0x647776,width:2})
          .circle(slot.x,slot.y+21,5).fill(0x405258));
      }
      drawTanks();
    }
    for(const pump of pumps){const display=displays.get(pump.id);if(!display)continue;
      const active=vehicles.find(v=>v.pumpId===pump.id&&(v.status==='fueling'||v.status==='finishing'));
      display.text=active?`${(active.deliveredMl/1000).toFixed(2)} л\n${(active.chargedKopeks/100).toFixed(2)} ₽\n${(active.salePriceKopeks/100).toFixed(2)} ₽/л`:'0.00 л\n0.00 ₽\nГОТОВА';
    }
  }
  function drawDeliveries(deliveries:readonly DeliveryTrip[]){
    deliveryLayer.removeChildren().forEach(child=>child.destroy({children:true}));
    const trip=deliveries.find(d=>d.status&&d.status!=='enroute'&&d.status!=='waiting');if(!trip)return;
    const {x,y,angle}=deliveryPose(trip);
    const vehicle={id:-1,modelId:'fuel-tanker',color:0xc5473b,x,y,angle,status:'road',deliveredMl:0,reservedMl:0} as Vehicle;
    const tanker=createVehicleVisual(vehicle);tanker.update(vehicle);deliveryLayer.addChild(tanker.root);
    if(trip.status==='unloading'||trip.status==='disconnecting')shape(deliveryLayer,g=>g.moveTo(x-32,y+18).bezierCurveTo(x+5,y+65,1780,270,1822,256).stroke({color:0x16262a,width:6}));
    const ratio=trip.totalMl?1-(trip.remainingMl??0)/trip.totalMl:0;
    const action=trip.status==='unloading'?`СЛИВ ${Math.round(ratio*100)}%`:trip.status==='connecting'?'ПОДКЛЮЧЕНИЕ':trip.status==='disconnecting'?'ОТКЛЮЧЕНИЕ':trip.status==='approaching'?'ПРИБЫТИЕ':'ВЫЕЗД';
    deliveryLayer.addChild(label(action,x,y-62,13));
  }
  const night=new Graphics().rect(0,0,SCENE_WIDTH,SCENE_HEIGHT).fill(0x071525);root.addChild(night);
  drawPumps();
  return {root,setTime(seconds){const daylight=Math.max(0,Math.sin(((getHour(seconds)-5)/14)*Math.PI));night.alpha=.33*(1-daylight);},
    setPrices(prices){signText.text='АЗС\n'+(['ai92','ai95'] as FuelId[]).map(f=>`${fuelNames[f]}  ${stocks[f]>0?(prices[f]/100).toFixed(2):'—'}`).join('\n');},
    setPumps(nextPumps,nextStocks,nextJobs=[],nextTanks=[]){
      pumps=nextPumps;jobs=nextJobs;tanks=nextTanks;
      stocks=Object.fromEntries(Object.keys(nextStocks).map(fuel=>[fuel,
        tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.stockMl,0)])) as Record<FuelId,number>;
      drawPumps();
    },
    setDeliveries(nextDeliveries){drawDeliveries(nextDeliveries);},
    setVehicles(nextVehicles){vehicles=nextVehicles;const active=new Set(vehicles.map(v=>v.id));
      for(const [id,visual] of visuals)if(!active.has(id)){vehicleLayer.removeChild(visual.root);visual.root.destroy({children:true});visuals.delete(id);motions.delete(id);}
      for(const vehicle of vehicles){let visual=visuals.get(vehicle.id);if(!visual){visual=createVehicleVisual(vehicle);visuals.set(vehicle.id,visual);vehicleLayer.addChild(visual.root);visual.update(vehicle);}else{
        const oldX=visual.root.x,oldY=visual.root.y,oldAngle=visual.root.rotation;visual.update(vehicle);
        const diff=Math.atan2(Math.sin(vehicle.angle-oldAngle),Math.cos(vehicle.angle-oldAngle));
        motions.set(vehicle.id,{root:visual.root,fromX:oldX,fromY:oldY,toX:vehicle.x,toY:vehicle.y,fromAngle:oldAngle,toAngle:oldAngle+diff,elapsed:0});
        visual.root.position.set(oldX,oldY);visual.root.rotation=oldAngle;
      }}
      drawPumps();effectLayer.removeChildren().forEach(child=>child.destroy());
      for(const v of vehicles.filter(v=>(v.status==='fueling'||v.status==='finishing')&&v.pumpId&&v.setupRemainingSeconds<60)){
        const pump=pumps.find(p=>p.id===v.pumpId),slot=pump&&PUMP_SLOTS[pump.slot];if(!slot)continue;
        shape(effectLayer,g=>g.moveTo(slot.x,slot.y+22).bezierCurveTo(slot.x+15,slot.y+80,v.x-20,v.y-25,v.x-25,v.y).stroke({color:0x172126,width:5})
          .circle(v.x-25,v.y,5).fill(0x252b2c));
      }
    },tick(elapsedMs){for(const motion of motions.values()){motion.elapsed=Math.min(50,motion.elapsed+elapsedMs);const t=motion.elapsed/50;
      motion.root.position.set(motion.fromX+(motion.toX-motion.fromX)*t,motion.fromY+(motion.toY-motion.fromY)*t);
      motion.root.rotation=motion.fromAngle+(motion.toAngle-motion.fromAngle)*t;
    }}};
}
