import { useEffect, useState } from 'react';
import { FUEL_IDS } from '../game/domain/config';
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
  const [sceneKey,setSceneKey]=useState(0);
  const paused=useUiStore((s)=>s.paused),speed=useUiStore((s)=>s.speed);
  const togglePause=useUiStore((s)=>s.togglePause),cycleSpeed=useUiStore((s)=>s.cycleSpeed);
  const resetControls=useUiStore((s)=>s.resetControls);
  useEffect(()=>{const unsubscribe=engine.subscribeState(setGameState);engine.start();return()=>{unsubscribe();engine.stop();};},[]);
  useEffect(()=>{engine.setControls(paused,speed);},[paused,speed]);
  const clock=getClock(gameState.gameSeconds);
  const time=String(clock.hour).padStart(2,'0')+':'+String(clock.minute).padStart(2,'0');
  const prices=Object.fromEntries(FUEL_IDS.map((id)=>[id,gameState.station.fuels[id].retailKopeks])) as Record<FuelId,number>;
  const openSection=(name:string)=>{
    if(name==='Сохранить'){engine.save();setNotice('Игра сохранена.');}
    else if(name==='Загрузить'){const ok=engine.loadSaved();if(ok){setGameState(engine.getState());setObjectId(null);setOverviewOpen(false);}setNotice(ok?'Сохранение загружено.':'Сохранение не найдено или повреждено.');}
    else if(name==='Цены') {setOverviewOpen(false);setObjectId('price-sign');}
    else if(name==='Закупки') {setOverviewOpen(false);setObjectId('delivery');}
    else if(name==='Топливо') {setOverviewOpen(false);setObjectId('tank');}
    else if(name==='Строительство'||name==='Развитие') {setOverviewOpen(false);setObjectId('expansion');}
    else if(name==='Обзор'||name==='Отчёты') {setObjectId(null);setOverviewOpen(true);}
    else setNotice(name==='Настройки'?'Камера: сдвиг одним пальцем, масштаб двумя пальцами. Колесо мыши меняет масштаб.':name+' — раздел будет доступен в следующих версиях.');
  };
  return <div className="app-shell">
    <TopBar clock={clock} time={time} station={gameState.station} stats={gameState.stats} queueCount={gameState.vehicles.filter(v=>v.status==='queued'||v.status==='entering').length} paused={paused} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={cycleSpeed} onFuel={()=>setFuelOpen((v)=>!v)} onMenu={()=>{setFuelOpen(false);setMenuOpen((v)=>!v);}} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas key={sceneKey} pumps={gameState.station.pumps} jobs={gameState.station.jobs??[]} tanks={gameState.station.tanks} deliveries={gameState.deliveries??[]} stocks={Object.fromEntries(FUEL_IDS.map(id=>[id,gameState.station.fuels[id].stockMl])) as Record<FuelId,number>} gameSeconds={gameState.gameSeconds} prices={prices} engine={engine}
        onObject={(id)=>{setNotice('');setOverviewOpen(false);setObjectId(id);}} />
      {objectId&&<ObjectPanel key={objectId} id={objectId} state={gameState} prices={prices} vehicles={gameState.vehicles}
        onPrice={(fuel,kopeks)=>{engine.setRetailPrice(fuel,kopeks);setGameState(engine.getState());}}
        onBuildPump={(slot)=>{const ok=engine.buildPump(slot);setGameState(engine.getState());return ok;}}
        onUpgradePump={(id)=>{const ok=engine.upgradePump(id);setGameState(engine.getState());return ok;}}
        onSetPumpFuels={(id,fuels)=>{const ok=engine.setPumpFuels(id,fuels);setGameState(engine.getState());return ok;}}
        onBuildTank={(fuel)=>{const ok=engine.buildTank(fuel);setGameState(engine.getState());return ok;}}
        onUpgradeTank={(id)=>{const ok=engine.upgradeTank(id);setGameState(engine.getState());return ok;}}
        onDelivery={(supplier,cargo)=>{const ok=engine.orderTrip(supplier,cargo);setGameState(engine.getState());return ok;}}
        onSetPumpEnabled={(id,enabled)=>{const ok=engine.setPumpEnabled(id,enabled);setGameState(engine.getState());return ok;}}
        onClose={()=>setObjectId(null)} />}
      {overviewOpen&&<OverviewPanel state={gameState} onClose={()=>setOverviewOpen(false)} />}
      {notice&&<div className="section-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Закрыть">×</button></div>}
    </main>
    {menuOpen&&<GameMenu onClose={()=>setMenuOpen(false)} onSection={openSection} onReset={()=>{engine.reset();resetControls();setGameState(engine.getState());setSceneKey(k=>k+1);setFuelOpen(false);setObjectId(null);setOverviewOpen(false);setNotice('Новая игра начата.');}} />}
    <UpdateNotice />
  </div>;
}
