import { useEffect, useState } from 'react';
import { INITIAL_STATION } from '../game/domain/config';
import { GameEngine } from '../game/simulation/GameEngine';
import { getClock, getTrafficMultiplier } from '../game/simulation/time';
import { GameMenu } from './GameMenu';
import { Icon } from './Icon';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { UpdateNotice } from './UpdateNotice';
import { StationCanvas } from './scene/StationCanvas';
import { useUiStore } from './store';

const engine = new GameEngine();

export function App() {
  const [gameSeconds, setGameSeconds] = useState(engine.getSnapshot());
  const [fuelOpen, setFuelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const paused = useUiStore((state) => state.paused);
  const speed = useUiStore((state) => state.speed);
  const togglePause = useUiStore((state) => state.togglePause);
  const setSpeed = useUiStore((state) => state.setSpeed);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setGameSeconds);
    engine.start();
    return () => { unsubscribe(); engine.stop(); };
  }, []);
  useEffect(() => { engine.setControls(paused || menuOpen, speed); }, [paused, menuOpen, speed]);

  const clock = getClock(gameSeconds);
  const time = `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
  const traffic = getTrafficMultiplier(gameSeconds);

  return <div className="app-shell">
    <TopBar clock={clock} time={time} traffic={traffic} paused={paused || menuOpen} speed={speed} fuelOpen={fuelOpen}
      onPause={togglePause} onSpeed={setSpeed} onFuel={() => setFuelOpen((value) => !value)} onMenu={() => { setFuelOpen(false); setMenuOpen(true); }} />
    <main className="game-stage" aria-label="Территория АЗС">
      <StationCanvas pumps={INITIAL_STATION.pumps} gameSeconds={gameSeconds} />
      <SideNav />
      <div className="stage-hint">ДВИГАЙТЕ КАРТУ ОДНИМ ПАЛЬЦЕМ · МАСШТАБИРУЙТЕ ДВУМЯ</div>
      <div className="quick-actions" aria-label="Будущие разделы">
        <div title="В следующих версиях"><Icon name="build" /><span>Строительство</span></div>
        <div title="В следующих версиях"><Icon name="people" /><span>Персонал</span></div>
        <div title="В следующих версиях"><Icon name="megaphone" /><span>Маркетинг</span></div>
        <div title="В следующих версиях"><Icon name="tasks" /><span>Задачи</span></div>
      </div>
    </main>
    {menuOpen && <GameMenu onClose={() => setMenuOpen(false)} />}
    <UpdateNotice />
  </div>;
}
