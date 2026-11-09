import { useEffect, useState } from 'react';
import { FUEL_IDS, INITIAL_STATION } from '../game/domain/config';
import type { FuelId } from '../game/domain/types';
import { GameEngine } from '../game/simulation/GameEngine';
import { getClock } from '../game/simulation/time';
import { GameMenu } from './GameMenu';
import { ObjectPanel } from './ObjectPanel';
import { OverviewPanel } from './OverviewPanel';
import { TopBar } from './TopBar';
import { UpdateNotice } from './UpdateNotice';
import { StationCanvas } from './scene/StationCanvas';
import type { ObjectId } from './scene/createStationScene';
import { useUiStore } from './store';
const engine=new GameEngine();
export function App() {
  const [gameState,setGameState]=useState(engine.getState());
  const [fuelOpen,setFuelOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [objectId,setObjectId]=useState<ObjectId|null>(null);
  const [overviewOpen,setOverviewOpen]=useState(false);
  const [notice,setNotice]=useState('');
  const paused=useUiStore((s)=>s.paused),speed=useUiStore((s)=>s.speed);
  const togglePause=useUiStore((s)=>s.togglePause),cycleSpeed=useUiStore((s)=>s.cycleSpeed);
  useEffect(()=>{const unsubscribe=engine.subscribeState(setGameState);engine.start();return()=>{unsubscribe();engine.stop();};},[]);
  useEffect(()=>{engine.setControls(paused,speed);},[paused,speed]);
  const clock=getClock(gameState.gameSeconds);
  const time=String(clock.hour).padStart(2,'0')+':'+String(clock.minute).padStart(2,'0');
  const prices=Object.fromEntries(FUEL_IDS.map((id)=>[id,gameState.station.fuels[id].retailKopeks])) as Record<FuelId,number>;
  const pumpFuels={
    'pump-1':gameState.station.pumps.find((pump)=>pump.id==='pump-1')?.fuels??[],
    'pump-2':gameState.station.pumps.find((pump)=>pump.id==='pump-2')?.fuels??[],
  };
  const openSection=(name:string)=>{
    if(name==='Цены') {setOverviewOpen(false);setObjectId('price-sign');}
    else if(name==='Топливо') {setOverviewOpen(false);setObjectId('tank');}
    else if(name==='Строительство'||name==='Развитие') {setOverviewOpen(false);setObjectId('expansion');}
    else if(name==='Обзор'||name==='Отчёты') {setObjectId(null);setOverviewOpen(true);}
    else setNotice(name==='Настройки'?'Камера: сдвиг одним пальцем, масштаб двумя пальцами. Колесо мыши меняет масштаб.':name+' — раздел будет доступен в следующих версиях.');
  };
  return <div className="app-shell">
    <TopBar clock={clock} time={time} station={gameState.station} stats={gameState.stats} paused={paused} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={cycleSpeed} onFuel={()=>setFuelOpen((v)=>!v)} onMenu={()=>{setFuelOpen(false);setMenuOpen((v)=>!v);}} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas pumps={INITIAL_STATION.pumps} gameSeconds={gameState.gameSeconds} prices={prices} engine={engine}
        onObject={(id)=>{setNotice('');setOverviewOpen(false);setObjectId(id);}} />
      {objectId&&<ObjectPanel id={objectId} prices={prices} pumpFuels={pumpFuels} station={gameState.station} vehicles={gameState.vehicles}
        onPrice={(fuel,kopeks)=>{engine.setRetailPrice(fuel,kopeks);setGameState(engine.getState());}}
        onPump={(id,fuels)=>{const result=engine.setPumpFuels(id,fuels);setGameState(engine.getState());return result;}}
        onClose={()=>setObjectId(null)} />}
      {overviewOpen&&<OverviewPanel state={gameState} onClose={()=>setOverviewOpen(false)} />}
      {notice&&<div className="section-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Закрыть">×</button></div>}
    </main>
    {menuOpen&&<GameMenu onClose={()=>setMenuOpen(false)} onSection={openSection} />}
    <UpdateNotice />
  </div>;
}
