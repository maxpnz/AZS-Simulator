import { StationSimulation } from './StationSimulation';
import { encodeStoredSave } from './saveCodec';

self.onmessage=(event:MessageEvent<{id:number;save:ReturnType<StationSimulation['exportSave']>}>)=>{
  const {id,save}=event.data;
  try{
    // Keep validation and compression away from the simulation/render thread.
    StationSimulation.importSave(save);
    self.postMessage({id,data:encodeStoredSave(JSON.stringify(save))});
  }catch(error){
    self.postMessage({id,error:error instanceof Error?error.message:String(error)});
  }
};
