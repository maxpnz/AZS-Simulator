import { Toast, toast } from './Toast';
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
import { App as CapacitorApp } from '@capacitor/app';
import { audio } from '../audio/AudioManager';
import { GameAudioEvents } from '../audio/GameAudioEvents';
const engine=new GameEngine();
const interactionGate=new InteractionGate();
const gameAudio=new GameAudioEvents(audio);
useUiStore.setState({speed:engine.getSpeed()});
type Screen='menu'|'overview'|'finances'|'competitors'|'technical'|'settings'|'start'|ObjectId|null;
export function App() {
  const [gameState,setGameState]=useState(engine.getState());
  const [fuelOpen,setFuelOpen]=useState(false);
  const [screen,setScreen]=useState<Screen>(null);

  const [sceneKey,setSceneKey]=useState(0);
  const [cameraVersion,setCameraVersion]=useState(0);
  const [selectedVehicle,setSelectedVehicle]=useState<number|null>(null);
  const [selectedTechnician,setSelectedTechnician]=useState<string|null>(null);
  const lastTechnicalNotice=useRef(gameState.technical?.noticeId);
  const constructionJobs=useRef(gameState.station.jobs??[]);
  const manualPause=useUiStore((s)=>s.paused),backgroundPause=useUiStore((s)=>s.backgroundPause),interfacePause=useUiStore((s)=>s.interfacePause),speed=useUiStore((s)=>s.speed);
  const togglePause=useUiStore((s)=>s.togglePause),cycleSpeed=useUiStore((s)=>s.cycleSpeed),resetControls=useUiStore((s)=>s.resetControls);
  useEffect(()=>{if(engine.getLoadError())toast('Не удалось загрузить сохранение. Проверьте хранилище браузера.','error');gameAudio.rebase(engine.getState());const unsubscribe=engine.subscribeState(state=>{gameAudio.update(state);setGameState(state);});engine.start();return()=>{unsubscribe();engine.stop();audio.dispose();};},[]);
  useEffect(()=>{
    const activate=()=>audio.activate();
    const click=(event:PointerEvent)=>{if((event.target as Element).closest('button'))audio.play('ui_click');};
    document.addEventListener('pointerdown',activate,{passive:true});document.addEventListener('keydown',activate);document.addEventListener('pointerdown',click,{passive:true});
    return()=>{document.removeEventListener('pointerdown',activate);document.removeEventListener('keydown',activate);document.removeEventListener('pointerdown',click);};
  },[]);
  useEffect(()=>{audio.setModalOpen(screen!==null);if(screen)audio.play('ui_open');else audio.play('ui_close');},[screen]);
  useEffect(()=>{audio.setGamePaused(manualPause||backgroundPause);},[manualPause,backgroundPause]);
  useEffect(()=>{
    const sync=()=>audio.setSuspended(document.visibilityState==='hidden'||!document.hasFocus());
    const onPause=()=>audio.setSuspended(true),onResume=()=>audio.setSuspended(document.visibilityState==='hidden'||!document.hasFocus());
    document.addEventListener('visibilitychange',sync);window.addEventListener('blur',onPause);window.addEventListener('focus',sync);
    window.addEventListener('azs-audio-focus-lost',onPause);window.addEventListener('azs-audio-focus-gained',onResume);
    let live=true;let nativeListener:{remove:()=>Promise<void>}|undefined;
    void CapacitorApp.addListener('appStateChange',({isActive})=>audio.setSuspended(!isActive)).then(listener=>{if(live)nativeListener=listener;else void listener.remove();}).catch(()=>{});
    return()=>{live=false;void nativeListener?.remove();document.removeEventListener('visibilitychange',sync);window.removeEventListener('blur',onPause);window.removeEventListener('focus',sync);window.removeEventListener('azs-audio-focus-lost',onPause);window.removeEventListener('azs-audio-focus-gained',onResume);};
  },[]);
  useEffect(()=>interactionGate.attach(document),[]);
  useEffect(()=>installWakeLock(),[]);
  useEffect(()=>{
    const technical=gameState.technical;
    if(!technical?.notice||!technical.noticeId||technical.noticeId===lastTechnicalNotice.current)return;
    lastTechnicalNotice.current=technical.noticeId;
    toast(technical.notice,technical.notice.startsWith('Недостаточно')?'error':technical.notice.includes('заверш')?'success':'info');
  },[gameState.technical?.noticeId]);
  useEffect(()=>{
    const current=gameState.station.jobs??[];
    const completed=constructionJobs.current.filter(job=>!current.some(next=>next.id===job.id));
    if(completed.length){
      const title=(job:typeof completed[number])=>{
        const pump=gameState.station.pumps.find(p=>p.id===job.targetId);
        const tankIndex=gameState.station.tanks.findIndex(t=>t.id===job.targetId);
        const object=job.kind.startsWith('pump')||job.kind==='rewire'?`ТРК №${(pump?.slot??Number(job.targetId.split('-').at(-1))-1)+1}`:`резервуар №${tankIndex+1}`;
        return `${object}: ${job.kind==='pump'||job.kind==='tank'?'строительство':job.kind==='rewire'?'подключение':'модернизация'} завершено`;
      };
      toast(completed.map(title).join(' · ')+'.','success');
    }
    constructionJobs.current=current;
  },[gameState.station.jobs]);
  const loadSlot=(slot:number)=>{
    gameAudio.suppressNext();
    const ok=engine.loadSlot(slot);
    if(ok){
      const loaded=engine.getState();
      gameAudio.rebase(loaded);
      lastTechnicalNotice.current=loaded.technical?.noticeId;
      constructionJobs.current=loaded.station.jobs??[];
      setGameState(loaded);
      setSceneKey(k=>k+1);
    }
    else gameAudio.rebase(engine.getState());
    return ok;
  };
  const resetGame=()=>{
    gameAudio.suppressNext();
    engine.reset();
    resetControls();
    const state=engine.getState();
    gameAudio.rebase(state);
    lastTechnicalNotice.current=state.technical?.noticeId;
    constructionJobs.current=state.station.jobs??[];
    setGameState(state);
    setSceneKey(k=>k+1);
    toast('Новая игра начата.','success');
  };
  useLayoutEffect(()=>{interactionGate.transition();},[screen]);
  useEffect(()=>{useUiStore.getState().setInterfacePause(screen!==null);engine.setControls(manualPause||backgroundPause||useUiStore.getState().interfacePause,speed);},[manualPause,backgroundPause,interfacePause,screen,speed]);
  useEffect(()=>{
    const onVisibility=()=>{const hidden=document.visibilityState==='hidden';const wasHidden=useUiStore.getState().backgroundPause;useUiStore.getState().setBackgroundPause(hidden);engine.setControls(useUiStore.getState().paused||hidden||useUiStore.getState().interfacePause,useUiStore.getState().speed);engine.resetClock();if(hidden)engine.save();else if(wasHidden){toast('Симуляция возобновлена после автопаузы');}};
    const onHide=()=>{useUiStore.getState().setBackgroundPause(true);engine.setControls(true,useUiStore.getState().speed);engine.save();};
    const onShow=()=>onVisibility();
    document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
    if(document.visibilityState==='hidden')onVisibility();
    return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);};
  },[]);
  const clock=getClock(gameState.gameSeconds);
  const time=String(clock.hour).padStart(2,'0')+':'+String(clock.minute).padStart(2,'0');
  const prices=Object.fromEntries(FUEL_IDS.map((id)=>[id,gameState.station.fuels[id].retailKopeks])) as Record<FuelId,number>;
  const openSection=(name:string)=>{if(name==='Обзор')setScreen('overview');else if(name==='Цены')setScreen('price-sign');else if(name==='Конкуренты')setScreen('competitors');else if(name==='Техническая служба')setScreen('technical');else if(name==='Магазин'||name==='Закупки магазина')setScreen('shop');else if(name==='Кафе'||name==='Закупки кафе')setScreen('cafe');else if(name==='Настройки')setScreen('settings');};
  const objectId=screen!==null&&!['menu','overview','finances','competitors','technical','settings','start','shop','cafe'].includes(screen)?screen as ObjectId:null;
  return <div className="app-shell">
    <TopBar clock={clock} time={time} station={gameState.station} stats={gameState.stats} queueCount={gameState.queueIds.length} paused={manualPause} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={cycleSpeed} onFuel={()=>setFuelOpen(v=>!v)} onFinance={()=>{setFuelOpen(false);setScreen('finances');}} onMenu={()=>{setFuelOpen(false);setScreen(current=>current==='menu'?null:'menu');}} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas key={sceneKey} resetCameraVersion={cameraVersion} stationName={gameState.station.name??'АЗС'} pumps={gameState.station.pumps} jobs={gameState.station.jobs??[]} tanks={gameState.station.tanks} deliveries={gameState.deliveries??[]} technical={gameState.technical!} stocks={Object.fromEntries(FUEL_IDS.map(id=>[id,gameState.station.fuels[id].stockMl])) as Record<FuelId,number>} gameSeconds={gameState.gameSeconds} prices={prices} engine={engine}
        onObject={id=>{audio.play('ui_select');setScreen(id);}} onVehicle={setSelectedVehicle} onTechnician={id=>{setSelectedTechnician(id);setScreen('technical');}} onCamera={camera=>audio.setCamera(camera)} />
    </main>
    {screen==='start'&&<section className="full-screen" role="dialog" aria-label="Стартовый экран"><div className="start-content"><img src="/icon-app-192.png" alt="AZS Simulator" width="128" height="128" /><h1>AZS Simulator</h1><button className="panel-action" onClick={()=>setScreen(null)}>Продолжить игру</button><button className="panel-action" onClick={()=>{if(window.confirm('Начать новую игру? Текущий прогресс будет сброшен.')){resetGame();setScreen(null);}}}>Новая игра</button></div></section>}
    {screen==='menu'&&<GameMenu onClose={()=>setScreen(null)} onSection={openSection} onSaveSlot={slot=>engine.saveSlot(slot)} onLoadSlot={loadSlot} getSlot={slot=>engine.getSlot(slot)} onExit={()=>{engine.save();setScreen('start');}} onReset={resetGame} />}
    {screen==='settings'&&<GameMenu settings stationName={gameState.station.name??'АЗС'} onCameraReset={()=>setCameraVersion(n=>n+1)} onStationName={name=>{engine.setStationName(name);setGameState(engine.getState());toast('Название АЗС сохранено.','success');}} onBack={()=>setScreen('menu')} onClose={()=>setScreen(null)} onSection={openSection} onSaveSlot={slot=>engine.saveSlot(slot)} onLoadSlot={loadSlot} getSlot={slot=>engine.getSlot(slot)} onExit={()=>{engine.save();setScreen('start');}} onReset={resetGame} />}
    {screen==='overview'&&<OverviewPanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {screen==='finances'&&<FinancePanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {(screen==='shop'||screen==='cafe')&&<CommercePanel key={screen} venue={screen} state={gameState} engine={engine} refresh={()=>setGameState(engine.getState())} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} onVenue={setScreen} />}
    {screen==='technical'&&<TechnicalPanel state={gameState} engine={engine} focusedId={selectedTechnician} refresh={()=>setGameState(engine.getState())} onClose={()=>{setSelectedTechnician(null);setScreen(null);}} onBack={()=>{setSelectedTechnician(null);setScreen('menu');}} />}
    {screen==='competitors'&&<CompetitorsPanel state={gameState} onClose={()=>setScreen(null)} onBack={()=>setScreen('menu')} />}
    {objectId&&<ObjectPanel key={objectId} id={objectId} state={gameState} prices={prices} vehicles={gameState.vehicles}
      onPrice={(fuel,kopeks)=>{engine.setRetailPrice(fuel,kopeks);setGameState(engine.getState());}}
      onBuildPump={(slot)=>{const ok=engine.buildPump(slot);if(ok)audio.play('ui_purchase');setGameState(engine.getState());return ok;}}
      onUpgradePump={(id)=>{const ok=engine.upgradePump(id);if(ok)audio.play('ui_purchase');setGameState(engine.getState());return ok;}}
      onSetPumpFuels={(id,fuels)=>{const ok=engine.setPumpFuels(id,fuels);setGameState(engine.getState());return ok;}}
      onBuildTank={(fuel)=>{const ok=engine.buildTank(fuel);if(ok)audio.play('ui_purchase');setGameState(engine.getState());return ok;}}
      onUpgradeTank={(id)=>{const ok=engine.upgradeTank(id);if(ok)audio.play('ui_purchase');setGameState(engine.getState());return ok;}}
      onDelivery={(supplier,cargo)=>{const ok=engine.orderTrip(supplier,cargo);setGameState(engine.getState());return ok;}}
      onSetPumpEnabled={(id,enabled)=>{const ok=engine.setPumpEnabled(id,enabled);setGameState(engine.getState());return ok;}}
      onCompetitors={()=>setScreen('competitors')}
      onTechnical={()=>setScreen('technical')} onCommerce={()=>setScreen('shop')}
      onSellPump={id=>{const ok=engine.sellPump(id);setGameState(engine.getState());return ok;}}
      onSellTank={id=>{const ok=engine.sellTank(id);setGameState(engine.getState());return ok;}}
      onBack={()=>setScreen('menu')} onClose={()=>setScreen(null)} />}
    {selectedVehicle!==null&&gameState.vehicles.some(v=>v.id===selectedVehicle)&&<VehiclePanel vehicle={gameState.vehicles.find(v=>v.id===selectedVehicle)!} fuelName={Object.fromEntries(FUEL_IDS.map(id=>[id,gameState.station.fuels[id].name])) as Record<FuelId,string>} prices={prices} customer={gameState.commerce?.customers[selectedVehicle]} onClose={()=>setSelectedVehicle(null)} />}
    <Toast /><UpdateNotice />
  </div>;
}
