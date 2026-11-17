import { useEffect, useRef } from 'react';
import { FUEL_IDS } from '../game/domain/config';
import type { ClockSnapshot, StationState, TimeSpeed } from '../game/domain/types';
import { FUEL_COLORS } from '../game/domain/stationGeometry';
import { Icon } from './Icon';
import { version as currentVersion } from '../../package.json';

const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const litres = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});

interface Props {
  clock: ClockSnapshot;
  time: string;
  station: StationState;
  queueCount: number;
  paused: boolean;
  speed: TimeSpeed;
  fuelOpen: boolean;
  onPause: () => void;
  onSpeed: () => void;
  onFuel: () => void;
  onMenu: () => void;
  onFinance: () => void;
  onSettings: () => void;
}

export function TopBar({ clock, time, station, queueCount, paused, speed, fuelOpen, onPause, onSpeed, onFuel, onMenu, onFinance, onSettings }: Props) {
  const totalFuel = station.tanks.reduce((total, tank) => total + tank.stockMl / 1000, 0);
  const fuelWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fuelOpen) return;
    const close = (event: PointerEvent) => { if (!fuelWrap.current?.contains(event.target as Node)) onFuel(); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [fuelOpen, onFuel]);

  return (
    <header className="game-topbar">
      <div className="game-brand" aria-label={`АЗС Simulator версия ${currentVersion}`}>
        <img className="brand-logo" src="/hud-logo.svg" alt="" width="112" height="40" />
        <small className="brand-version">v{currentVersion}</small>
      </div>
      <div className="top-chip day-chip"><Icon name="calendar" /><span>День {clock.day} · {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][(clock.day-1)%7]}</span></div>
      <div className="top-chip clock-chip"><Icon name="clock" /><strong>{time}</strong></div>
      <div className="time-controls" aria-label="Управление временем">
        <button type="button" className="control-pause" onClick={onPause} aria-label={paused ? 'Продолжить игру' : 'Пауза'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} /></button>
        <button type="button" className="speed active" onClick={onSpeed} aria-label={`Скорость ${speed}×. Следующая скорость`}>{speed}×</button>
      </div>
      <div className="top-grow" />
      <div className="top-chip traffic-chip" title={`Очередь: ${queueCount}`}><Icon name="traffic" /><span>Очередь</span><strong>{queueCount}</strong></div>
      <div className="top-chip rating-chip" title="Рейтинг появится в будущем" aria-label="Рейтинг АЗС пока недоступен"><span aria-hidden="true">☆</span><strong>— / 5</strong></div>
      <div className="fuel-wrap" ref={fuelWrap}>
        <button type="button" className={`top-chip fuel-chip ${fuelOpen ? 'selected' : ''}`} onClick={onFuel} aria-expanded={fuelOpen} aria-controls="fuel-popover">
          <Icon name="fuel" /><span>Топливо</span><strong>{litres.format(totalFuel)} л</strong><Icon name="chevron" className="chevron" />
        </button>
        {fuelOpen && <div id="fuel-popover" className="fuel-popover" role="region" aria-label="Остатки топлива">
          <div className="popover-title"><Icon name="fuel" /> Топливо в резервуарах <button type="button" onClick={onFuel} aria-label="Закрыть остатки топлива"><Icon name="close" /></button></div>
          {FUEL_IDS.map((fuel) => {
            const tanks=station.tanks.filter(t=>t.fuel===fuel);
            const amount=tanks.reduce((sum,t)=>sum+t.stockMl,0),capacity=tanks.reduce((sum,t)=>sum+t.capacityMl,0);
            const percent=capacity>0?Math.round(amount/capacity*100):0;
            return <div className="fuel-row" key={fuel}>
              <strong><i style={{backgroundColor:`#${FUEL_COLORS[fuel].toString(16).padStart(6,'0')}`}} />{station.fuels[fuel].name}</strong>
              <span className="fuel-track"><span style={{ width: `${Math.max(0,Math.min(100,percent))}%`,backgroundColor:`#${FUEL_COLORS[fuel].toString(16).padStart(6,'0')}` }} /></span>
              <span>{percent}%</span><b>{litres.format(amount/1000)} / {litres.format(capacity/1000)} л</b>
            </div>;
          })}
        </div>}
      </div>
      <button type="button" className="top-chip money-chip" onClick={onFinance} aria-label="Открыть финансы АЗС"><Icon name="wallet" /><strong>{rubles.format(station.balanceKopeks / 100)}</strong></button>
      <div className="top-chip pumps-chip" title="Занято монтажных мест"><Icon name="pumps" /><strong>{station.pumps.length}/10</strong></div>
      <button type="button" className="menu-trigger settings-trigger" onClick={onSettings} aria-label="Настройки"><Icon name="settings" /></button>
      <button type="button" className="menu-trigger" onClick={onMenu} aria-label="Открыть меню"><Icon name="menu" /></button>
    </header>
  );
}
