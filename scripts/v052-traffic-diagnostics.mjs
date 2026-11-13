import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const [{StationSimulation},{cloneLegacyStation},{deliveryPose}]=await Promise.all([server.ssrLoadModule('/src/game/simulation/StationSimulation.ts'),server.ssrLoadModule('/src/game/domain/config.ts'),server.ssrLoadModule('/src/game/domain/deliveryMotion.ts')]);
 const sim=new StationSimulation(0x41a25,cloneLegacyStation());
 const row=v=>({gameSeconds:sim.gameSeconds,id:v.id,modelId:v.modelId,status:v.status,x:+v.x.toFixed(2),y:+v.y.toFixed(2),heading:+v.angle.toFixed(4),pumpId:v.pumpId??null,route:v.route,routeIndex:v.routeIndex,target:v.route[v.routeIndex]??null,waitedSeconds:v.waitedSeconds,serviceRemainingSeconds:v.serviceRemainingSeconds,phaseRemainingSeconds:v.phaseRemainingSeconds??null});
 let exit=null,pump2=null,queue=null;
 for(let i=0;i<8000;i++){
  sim.step(30);
  for(const v of sim.vehicles){
   if(!exit&&v.status==='leaving'&&v.x<400&&v.y>650&&v.y<900&&Math.abs(Math.sin(v.angle))>.15)exit=row(v);
   if(!pump2&&v.pumpId==='pump-2'&&v.status==='toPump'&&Math.abs(Math.sin(v.angle))>.15&&v.x>620&&v.x<870&&v.y>590&&v.y<800)pump2=row(v);
   if(!queue&&v.status==='queued')queue=row(v);
  }
  if(exit&&pump2&&queue)break;
 }
 const progress=[];let previous='';for(let i=0;i<2000;i++){sim.step(30);const v=sim.vehicles.find(v=>v.id===pump2?.id);const status=v?.status??'gone';if(status!==previous){progress.push(v?row(v):{gameSeconds:sim.gameSeconds,status});previous=status;}if(status==='gone')break;}const delivery=[0,300,600].map(phaseSeconds=>({status:'approaching',phaseSeconds,target:'delivery pad',remainingMl:200000,...deliveryPose({status:'approaching',phaseSeconds})}));console.log(JSON.stringify({exit,pump2,queue,delivery,progress,final:{seconds:sim.gameSeconds,purchases:sim.stats.purchases,stalls:sim.trafficDiagnostics(1500)}},null,2));
}finally{await server.close();}
