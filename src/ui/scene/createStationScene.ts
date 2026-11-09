import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import sceneArt from '../../assets/station-scene-v023.png';
import carArt from '../../assets/vehicle-car-v023.png';
import truckArt from '../../assets/vehicle-truck-v023.png';
import type { FuelId, Pump, Vehicle } from '../../game/domain/types';
import { getHour } from '../../game/simulation/time';
import { createVehicleVisual, type VehicleVisual } from './vehicleSprite';

export const SCENE_WIDTH = 2000, SCENE_HEIGHT = 1200;
export type ObjectId = 'price-sign' | 'pump-1' | 'pump-2' | 'tank' | 'shop' | 'delivery' | 'expansion';
export interface Hotspot { id: ObjectId; polygon: readonly [number, number][] }
/** Polygons follow the actual painted objects in the new, full-scene artwork. */
export const HOTSPOTS: readonly Hotspot[] = [
  { id:'price-sign', polygon:[[145,275],[260,275],[265,650],[130,650]] },
  { id:'pump-1', polygon:[[755,440],[910,440],[910,650],[755,650]] },
  { id:'pump-2', polygon:[[1265,440],[1420,440],[1420,650],[1265,650]] },
  { id:'tank', polygon:[[1360,75],[1685,75],[1685,335],[1360,335]] },
  { id:'shop', polygon:[[420,100],[1225,100],[1225,425],[420,425]] },
  { id:'delivery', polygon:[[1515,345],[1690,345],[1690,435],[1515,435]] },
  { id:'expansion', polygon:[[965,635],[1220,635],[1220,710],[965,710]] },
];
export function hitTest(x:number,y:number):ObjectId|null {
  for (const {id,polygon} of HOTSPOTS) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    if(inside) return id;
  }
  return null;
}
function label(value:string,x:number,y:number,size:number,color=0xffffff) {
  const t=new Text({text:value,style:{fontFamily:'Arial',fontSize:size,fontWeight:'bold',fill:color,stroke:{color:0x152325,width:4}}});
  t.anchor.set(.5);t.position.set(x,y);return t;
}
export interface StationScene { root:Container; setTime:(gameSeconds:number)=>void; setPrices:(prices:Record<FuelId,number>)=>void; setVehicles:(vehicles:readonly Vehicle[])=>void }
export async function createStationScene(_pumps:readonly Pump[]):Promise<StationScene> {
  const root=new Container();
  const [sceneTexture,carTexture,truckTexture]=await Promise.all([Assets.load(sceneArt),Assets.load(carArt),Assets.load(truckArt)]);
  const background=new Sprite(sceneTexture);
  background.width=SCENE_WIDTH;background.height=SCENE_HEIGHT;
  root.addChild(background);
  // Separate road-space layers share coordinates with the route nodes. The visual artwork
  // supplies detailed asphalt; these transparent polygons define the actual lane geometry.
  const roadGeometry=new Graphics();
  roadGeometry.rect(0,744,2000,140).fill({color:0x263038,alpha:.001});
  roadGeometry.rect(0,949,2000,150).fill({color:0x263038,alpha:.001});
  roadGeometry.poly([250,744,400,735,515,660,540,600,445,610,340,700]).fill({color:0x263038,alpha:.001});
  roadGeometry.poly([1570,600,1715,630,1810,735,1930,744,1770,744,1680,690]).fill({color:0x263038,alpha:.001});
  root.addChild(roadGeometry);
  const overlays=new Container();
  overlays.addChild(label('ВЪЕЗД',355,725,22),label('ВЫЕЗД',1790,725,22));
  const signText=new Text({text:'АЗС\n92  57.00\n95  63.00',style:{fontFamily:'Arial',fontSize:15,fontWeight:'bold',fill:0xf9f4dc,align:'center',lineHeight:34,
    stroke:{color:0x13232a,width:2}}});
  signText.anchor.set(.5);signText.position.set(210,405);overlays.addChild(signText);
  root.addChild(overlays);
  const vehicleLayer=new Container();
  const vehicleSprites=new Map<number,VehicleVisual>();
  root.addChild(vehicleLayer);
  const night=new Graphics().rect(0,0,SCENE_WIDTH,SCENE_HEIGHT).fill(0x071525);
  root.addChild(night);
  return {root,setTime(gameSeconds){const daylight=Math.max(0,Math.sin(((getHour(gameSeconds)-5)/14)*Math.PI));night.alpha=.28*(1-daylight);},
    setPrices(prices){signText.text='АЗС\n92  '+(prices.ai92/100).toFixed(2)+'\n95  '+(prices.ai95/100).toFixed(2);},
    setVehicles(vehicles){
      const active=new Set(vehicles.map((vehicle)=>vehicle.id));
      for(const [id,visual] of vehicleSprites) if(!active.has(id)) {vehicleLayer.removeChild(visual.root);visual.root.destroy({children:true});vehicleSprites.delete(id);}
      for(const vehicle of vehicles) {
        let visual=vehicleSprites.get(vehicle.id);
        if(!visual) {visual=createVehicleVisual(vehicle,carTexture,truckTexture);vehicleSprites.set(vehicle.id,visual);vehicleLayer.addChild(visual.root);}
        visual.update(vehicle);
      }
    }};
}
