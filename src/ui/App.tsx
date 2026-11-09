import { useEffect, useState } from 'react';
import { FUEL_IDS, INITIAL_STATION } from '../game/domain/config';
import type { FuelId } from '../game/domain/types';
import { GameEngine } from '../game/simulation/GameEngine';
import { getClock, getTrafficMultiplier } from '../game/simulation/time';
import { GameMenu } from './GameMenu';
import { ObjectPanel } from './ObjectPanel';
import { TopBar } from './TopBar';
import { UpdateNotice } from './UpdateNotice';
import { StationCanvas } from './scene/StationCanvas';
import type { ObjectId } from './scene/createStationScene';
import { useUiStore } from './store';
const engine = new GameEngine();
export function App() {
  const [gameSeconds,setGameSeconds] = useState(engine.getSnapshot());
  const [fuelOpen,setFuelOpen] = useState(false);
  const [menuOpen,setMenuOpen] = useState(false);
  const [objectId,setObjectId] = useState<ObjectId|null>(null);
  const [notice,setNotice] = useState('');
  const [prices,setPrices] = useState<Record<FuelId,number>>(() => Object.fromEntries(FUEL_IDS.map((id)=>[id,INITIAL_STATION.fuels[id].retailKopeks])) as Record<FuelId,number>);
  const [pumpFuels,setPumpFuels] = useState<Record<'pump-1'|'pump-2',FuelId[]>>({ 'pump-1': [...INITIAL_STATION.pumps[0].fuels], 'pump-2': [...INITIAL_STATION.pumps[1].fuels] });
  const paused=useUiStore((s)=>s.paused), speed=useUiStore((s)=>s.speed);
  const togglePause=useUiStore((s)=>s.togglePause), cycleSpeed=useUiStore((s)=>s.cycleSpeed);
  useEffect(()=>{ const unsubscribe=engine.subscribe(setGameSeconds); engine.start(); return ()=>{unsubscribe();engine.stop();}; },[]);
  useEffect(()=>{ engine.setControls(paused,speed); },[paused,speed]);
  const clock=getClock(gameSeconds), time=String(clock.hour).padStart(2,'0')+':'+String(clock.minute).padStart(2,'0');
  const openSection=(name:string)=>{
    if (name==='Цены') setObjectId('price-sign');
    else if (name==='Топливо') setObjectId('tank');
    else if (name==='Строительство'||name==='Развитие') setObjectId('expansion');
    else if (name==='Обзор') setObjectId(null);
    else setNotice(name==='Настройки' ? 'Камера: сдвиг одним пальцем, масштаб двумя пальцами. Колесо мыши меняет масштаб.' : name+' — раздел будет доступен в следующих версиях.');
  };
  return <div className="app-shell">
    <TopBar clock={clock} time={time} traffic={getTrafficMultiplier(gameSeconds)} paused={paused} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={cycleSpeed} onFuel={()=>setFuelOpen((v)=>!v)} onMenu={()=>{setFuelOpen(false);setMenuOpen((v)=>!v);}} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas pumps={INITIAL_STATION.pumps} gameSeconds={gameSeconds} prices={prices} onObject={(id)=>{setNotice('');setObjectId(id);}} />
      {objectId && <ObjectPanel id={objectId} prices={prices} pumpFuels={pumpFuels}
        onPrice={(fuel,kopeks)=>setPrices((v)=>({...v,[fuel]:kopeks}))}
        onPump={(id,fuels)=>setPumpFuels((v)=>({...v,[id]:fuels}))} onClose={()=>setObjectId(null)} />}
      {notice && <div className="section-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Закрыть">×</button></div>}
    </main>
    {menuOpen && <GameMenu onClose={()=>setMenuOpen(false)} onSection={openSection} />}
    <UpdateNotice />
  </div>;
}
