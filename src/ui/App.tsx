import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FUEL_IDS } from '../game/domain/config';
import type { FuelId } from '../game/domain/types';
import { GameEngine } from '../game/simulation/GameEngine';
import { getClock } from '../game/simulation/time';
import { CommercePanel } from './CommercePanel';
import { FinancePanel } from './FinancePanel';
import { TechnicalPanel } from './TechnicalPanel';
import { installWakeLock } from '../platform/wakeLock';
import { CompetitorsPanel } from './CompetitorsPanel';
import { VehiclePanel } from './VehiclePanel';
import { GameMenu } from './GameMenu';
import { ObjectPanel } from './ObjectPanel';
import { OverviewPanel } from './OverviewPanel';
import { TopBar } from './TopBar';
import { UpdateNotice } from './UpdateNotice';
import { StationCanvas } from './scene/StationCanvas';
import type { ObjectId } from './scene/createStationScene';
import { useUiStore } from './store';
import { InteractionGate } from './interactionGate';
const engine=new GameEngine();
const interactionGate=new InteractionGate();
useUiStore.setState({speed:engine.getSpeed()});
type Screen='menu'|'overview'|'finances'|'competitors'|'technical'|'settings'|'commerce'|'start'|ObjectId|null;
export function App() {
  const [gameState,setGameState]=useState(engine.getState());
  const [fuelOpen,setFuelOpen]=useState(false);
  const [screen,setScreen]=useState<Screen>(null);
  const [notice,setNotice]=useState(engine.getLoadError()?'Не удалось загрузить сохранение. Исходные данные сохранены; проверьте хранилище браузера.':'');
  const [sceneKey,setSceneKey]=useState(0);
  const [selectedVehicle,setSelectedVehicle]=useState<number|null>(null);
  const [selectedTechnician,setSelectedTechnician]=useState<string|null>(null);
  const lastTechnicalNotice=useRef(0);
  const manualPause=useUiStore((s)=>s.paused),backgroundPause=useUiStore((s)=>s.backgroundPause),interfacePause=useUiStore((s)=>s.interfacePause),speed=useUiStore((s)=>s.speed);
  const togglePause=useUiStore((s)=>s.togglePause),cycleSpeed=useUiStore((s)=>s.cycleSpeed),resetControls=useUiStore((s)=>s.resetControls);
  useEffect(()=>{const unsubscribe=engine.subscribeState(setGameState);engine.start();return()=>{unsubscribe();engine.stop();};},[]);
  useEffect(()=>interactionGate.attach(document),[]);
  useEffect(()=>installWakeLock(),[]);
  useEffect(()=>{
    const technical=gameState.technical;
    if(!technical?.notice||!technical.noticeId||technical.noticeId===lastTechnicalNotice.current)return;
    lastTechnicalNotice.current=technical.noticeId;setNotice(technical.notice);
    const timer=window.setTimeout(()=>setNotice(current=>current===technical.notice?'':current),4500);
    return()=>window.clearTimeout(timer);
  },[gameState.technical?.noticeId]);
  useLayoutEffect(()=>{interactionGate.transition();},[screen]);
  useEffect(()=>{useUiStore.getState().setInterfacePause(screen!==null);engine.setControls(manualPause||backgroundPause||useUiStore.getState().interfacePause,speed);},[manualPause,backgroundPause,interfacePause,screen,speed]);
  useEffect(()=>{
    const onVisibility=()=>{const hidden=document.visibilityState==='hidden';const wasHidden=useUiStore.getState().backgroundPause;useUiStore.getState().setBackgroundPause(hidden);engine.setControls(useUiStore.getState().paused||hidden||useUiStore.getState().interfacePause,useUiStore.getState().speed);engine.resetClock();if(hidden)engine.save();else if(wasHidden){setNotice('Симуляция возобновлена после автопаузы');window.setTimeout(()=>setNotice(current=>current==='Симуляция возобновлена после автопаузы'?'':current),3500);}};
    const onHide=()=>{useUiStore.getState().setBackgroundPause(true);engine.setControls(true,useUiStore.getState().speed);engine.save();};
    const onShow=()=>onVisibility();
    document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
    if(document.visibilityState==='hidden')onVisibility();
    return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);};
  },[]);
  const clock=getClock(gameState.gameSeconds);
  const time=String(clock.hour).padStart(2,'0')+':'+String(clock.minute).padStart(2,'0');
  const prices=Object.fromEntries(FUEL_IDS.map((id)=>[id,gameState.station.fuels[id].retailKopeks])) as Record<FuelId,number>;
  const openSection=(name:string)=>{if(name==='Обзор')setScreen('overview');else if(name==='Цены')setScreen('price-sign');else if(name==='Конкуренты')setScreen('competitors');else if(name==='Техническая служба')setScreen('technical');else if(name==='Магазин и кафе'||name==='Закупки'||name==='Склады')setScreen('commerce');else if(name==='Настройки')setScreen('settings');};
  const objectId=screen!==null&&!['menu','overview','finances','competitors','technical','settings','commerce','start'].includes(screen)?screen as ObjectId:null;
  return <div className="app-shell">
    <TopBar clock={clock} time={time} station={gameState.station} stats={gameState.stats} queueCount={gameState.vehicles.filter(v=>v.status==='queued'||v.status==='entering').length} paused={manualPause} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={cycleSpeed} onFuel={()=>setFuelOpen(v=>!v)} onFinance={()=>{setFuelOpen(false);setScreen('finances');}} onMenu={()=>{setFuelOpen(false);setScreen(current=>current==='menu'?null:'menu');}} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas key={sceneKey} stationName={gameState.station.name??'АЗС'} pumps={gameState.station.pumps} jobs={gameState.station.jobs??[]} tanks={gameState.station.tanks} deliveries={gameState.deliveries??[]} technical={gameState.technical!} stocks={Object.fromEntries(FUEL_IDS.map(id=>[id,gameState.station.fuels[id].stockMl])) as Record<FuelId,number>} gameSeconds={gameState.gameSeconds} prices={prices} engine={engine}
        onObject={(id)=>{setNotice('');setScreen(id);}} onVehicle={setSelectedVehicle} onTechnician={id=>{setSelectedTechnician(id);setScreen('technical');}} />
      {notice&&<div className="section-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Закрыть">×</button></div>}
    </main>
    {screen==='start'&&<section className="full-screen" role="dialog" aria-label="Стартовый экран"><div className="start-content"><img src="/icon-app-192.png" alt="AZS Simulator" width="128" height="128" /><h1>AZS Simulator</h1><button className="panel-action" onClick={()=>setScreen(null)}>Продолжить игру</button><button className="panel-action" onClick={()=>{if(window.confirm('Начать новую игру? Текущий прогресс будет сброшен.')){engine.reset();resetControls();setGameState(engine.getState());setSceneKey(k=>k+1);setScreen(null);}}}>Новая игра</button></div></section>}
    {screen==='menu'&&<GameMenu onClose={()=>setScreen(null)} onSection={openSection} onSaveSlot={slot=>engine.saveSlot(slot)} onLoadSlot={slot=>{const ok=engine.loadSlot(slot);if(ok){setGameState(engine.getState());setSceneKey(k=>k+1);}return ok;}} hasSlot={slot=>engine.hasSlot(slot)} onExit={()=>{engine.save();setScreen('start');}} onReset={()=>{engine.reset();engine.setControls(true,1);resetControls();setGameState(engine.getState());setSceneKey(k=>k+1);setNotice('Новая игра начата.');}} />}
    {screen==='settings'&&<GameMenu settings stationName={gameState.station.name??'АЗС'} onStationName={name=>{engine.setStationName(name);setGameState(engine.getState());}} onBack={()=>setScreen('menu')} onClose={()=>setScreen(null)} onSection={openSection} onSaveSlot={slot=>engine.saveSlot(slot)} onLoadSlot={slot=>{const ok=engine.loadSlot(slot);if(ok){setGameState(engine.getState());setSceneKey(k=>k+1);}return ok;}} hasSlot={slot=>engine.hasSlot(slot)} onExit={()=>{engine.save();setScreen('start');}} onReset={()=>{engine.reset();engine.setControls(true,1);resetControls();setGameState(engine.getState());setSceneKey(k=>k+1);setNotice('Новая игра начата.');}} />}
    {screen==='overview'&&<OverviewPanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {screen==='finances'&&<FinancePanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {screen==='commerce'&&<CommercePanel state={gameState} engine={engine} refresh={()=>setGameState(engine.getState())} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {screen==='technical'&&<TechnicalPanel state={gameState} engine={engine} focusedId={selectedTechnician} refresh={()=>setGameState(engine.getState())} onClose={()=>{setSelectedTechnician(null);setScreen(null);}} onBack={()=>{setSelectedTechnician(null);setScreen('menu');}} />}
    {screen==='competitors'&&<CompetitorsPanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {objectId&&<ObjectPanel key={objectId} id={objectId} state={gameState} prices={prices} vehicles={gameState.vehicles}
      onPrice={(fuel,kopeks)=>{engine.setRetailPrice(fuel,kopeks);setGameState(engine.getState());}}
      onBuildPump={(slot)=>{const ok=engine.buildPump(slot);setGameState(engine.getState());return ok;}}
      onUpgradePump={(id)=>{const ok=engine.upgradePump(id);setGameState(engine.getState());return ok;}}
      onSetPumpFuels={(id,fuels)=>{const ok=engine.setPumpFuels(id,fuels);setGameState(engine.getState());return ok;}}
      onBuildTank={(fuel)=>{const ok=engine.buildTank(fuel);setGameState(engine.getState());return ok;}}
      onUpgradeTank={(id)=>{const ok=engine.upgradeTank(id);setGameState(engine.getState());return ok;}}
      onDelivery={(supplier,cargo)=>{const ok=engine.orderTrip(supplier,cargo);setGameState(engine.getState());return ok;}}
      onSetPumpEnabled={(id,enabled)=>{const ok=engine.setPumpEnabled(id,enabled);setGameState(engine.getState());return ok;}}
      onCompetitors={()=>setScreen('competitors')}
      onTechnical={()=>setScreen('technical')} onCommerce={()=>setScreen('commerce')}
      onSellPump={id=>{const ok=engine.sellPump(id);setGameState(engine.getState());return ok;}}
      onSellTank={id=>{const ok=engine.sellTank(id);setGameState(engine.getState());return ok;}}
      onBack={()=>setScreen('menu')} onClose={()=>setScreen(null)} />}
    {selectedVehicle!==null&&gameState.vehicles.some(v=>v.id===selectedVehicle)&&<VehiclePanel vehicle={gameState.vehicles.find(v=>v.id===selectedVehicle)!} fuelName={Object.fromEntries(FUEL_IDS.map(id=>[id,gameState.station.fuels[id].name])) as Record<FuelId,string>} prices={prices} customer={gameState.commerce?.customers[selectedVehicle]} onClose={()=>setSelectedVehicle(null)} />}
    <UpdateNotice />
  </div>;
}
