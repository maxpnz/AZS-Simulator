import { useEffect, useState } from 'react';
import { INITIAL_STATION } from '../game/domain/config';
import { GameEngine } from '../game/simulation/GameEngine';
import { getClock, getDayPhase, getTrafficMultiplier } from '../game/simulation/time';
import type { TimeSpeed } from '../game/domain/types';
import { useUiStore } from './store';
import { StationCanvas } from './scene/StationCanvas';
import { UpdateNotice } from './UpdateNotice';

const engine = new GameEngine();
const speeds: readonly TimeSpeed[] = [1, 2, 5, 10];

const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

export function App() {
  const [gameSeconds, setGameSeconds] = useState(engine.getSnapshot());
  const paused = useUiStore((state) => state.paused);
  const speed = useUiStore((state) => state.speed);
  const togglePause = useUiStore((state) => state.togglePause);
  const setSpeed = useUiStore((state) => state.setSpeed);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setGameSeconds);
    engine.start();
    return () => { unsubscribe(); engine.stop(); };
  }, []);
  useEffect(() => { engine.setControls(paused, speed); }, [paused, speed]);

  const clock = getClock(gameSeconds);
  const phase = getDayPhase(gameSeconds);
  const traffic = getTrafficMultiplier(gameSeconds);
  const time = `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">АЗС</div>
          <div><strong>АЗС Simulator</strong><span>ПЕРВАЯ СТАНЦИЯ · V0.1</span></div>
        </div>
        <div className="topbar-stats">
          <div className="top-stat"><span>БАЛАНС</span><strong>{rubles.format(INITIAL_STATION.balanceKopeks / 100)}</strong></div>
          <div className="top-stat clock-stat"><span>ДЕНЬ {clock.day} · {phase.toUpperCase()}</span><strong>{time}</strong></div>
        </div>
      </header>

      <main className="workspace">
        <section className="scene-panel" aria-label="Территория АЗС">
          <div className="scene-topline"><span className="live-dot" /> ТЕРРИТОРИЯ СТАНЦИИ <span className="scene-coordinate">СЕКТОР 01 / ГОРОД</span></div>
          <StationCanvas pumps={INITIAL_STATION.pumps} gameSeconds={gameSeconds} />
          <div className="scene-bottomline"><span>ДВИГАЙТЕ КАРТУ ОДНИМ ПАЛЬЦЕМ · МАСШТАБИРУЙТЕ ДВУМЯ</span><span>2 КОЛОНКИ · 6 СВОБОДНЫХ МЕСТ</span></div>
        </section>

        <aside className="sidebar">
          <div className="panel-heading"><span className="eyebrow">УПРАВЛЕНИЕ</span><h1>Моя АЗС</h1><p>Ваш бизнес начинается здесь.</p></div>
          <section className="info-card time-card">
            <div className="card-title"><span>ИГРОВОЕ ВРЕМЯ</span><span className="status-pill">{paused ? 'ПАУЗА' : 'В ЭФИРЕ'}</span></div>
            <div className="time-display">{time}<small>ДЕНЬ {clock.day}</small></div>
            <button type="button" className={`pause-button ${paused ? 'is-paused' : ''}`} onClick={togglePause}>
              <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>{paused ? 'Продолжить' : 'Пауза'}
            </button>
            <div className="speed-caption">СКОРОСТЬ СИМУЛЯЦИИ</div>
            <div className="speed-group" aria-label="Скорость симуляции">
              {speeds.map((value) => <button key={value} type="button" className={speed === value && !paused ? 'active' : ''} onClick={() => setSpeed(value)} aria-pressed={speed === value && !paused}>{value}×</button>)}
            </div>
          </section>

          <section className="info-card overview-card">
            <div className="card-title">ОБЗОР СТАНЦИИ</div>
            <div className="metric-row"><span>Топливные колонки</span><strong>02 <em>/ 08</em></strong></div>
            <div className="capacity-track"><span style={{ width: '25%' }} /></div>
            <div className="metric-row"><span>Виды топлива</span><strong>06</strong></div>
            <div className="metric-row"><span>Трафик сейчас</span><strong>{traffic >= 1.15 ? 'Высокий' : traffic < 0.5 ? 'Низкий' : 'Обычный'}</strong></div>
          </section>

          <div className="sidebar-note"><span className="note-icon">✦</span><p>Станция готова к работе. Управление топливом и клиентами появится в следующих обновлениях.</p></div>
        </aside>
      </main>
      <footer className="footer"><span>АЗС SIMULATOR</span><span>ПРОТОТИП 0.1 · ЛОКАЛЬНАЯ ИГРА</span></footer>
      <UpdateNotice />
    </div>
  );
}
