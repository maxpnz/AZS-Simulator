import type { ClockSnapshot, StationState, TrafficStats, TimeSpeed } from '../game/domain/types';
import { Icon } from './Icon';

const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const litres = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});

interface Props {
  clock: ClockSnapshot;
  time: string;
  station: StationState;
  stats: TrafficStats;
  queueCount: number;
  paused: boolean;
  speed: TimeSpeed;
  fuelOpen: boolean;
  onPause: () => void;
  onSpeed: () => void;
  onFuel: () => void;
  onMenu: () => void;
}

export function TopBar({ clock, time, station, stats, queueCount, paused, speed, fuelOpen, onPause, onSpeed, onFuel, onMenu }: Props) {
  const totalFuel = station.tanks.reduce((total, tank) => total + tank.stockMl / 1000, 0);

  return (
    <header className="game-topbar">
      <div className="game-brand" aria-label="АЗС Simulator версия 0.2.6">
        <span className="brand-emblem"><span>АЗС</span></span>
        <span className="brand-name"><strong>АЗС</strong><small>Simulator <em>v0.2.6</em></small></span>
      </div>
      <div className="top-chip day-chip"><Icon name="calendar" /><span>День {clock.day}</span></div>
      <div className="top-chip clock-chip"><Icon name="clock" /><strong>{time}</strong></div>
      <div className="time-controls" aria-label="Управление временем">
        <button type="button" className="control-pause" onClick={onPause} aria-label={paused ? 'Продолжить игру' : 'Пауза'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} /></button>
        <button type="button" className="speed active" onClick={onSpeed} aria-label={'Скорость ' + speed + '×. Следующая скорость'}>{speed}×</button>
      </div>
      <div className="top-grow" />
      <div className="top-chip money-chip"><Icon name="wallet" /><strong>{rubles.format(station.balanceKopeks / 100)}</strong></div>
      <div className="fuel-wrap">
        <button type="button" className={`top-chip fuel-chip ${fuelOpen ? 'selected' : ''}`} onClick={onFuel} aria-expanded={fuelOpen} aria-controls="fuel-popover">
          <Icon name="fuel" /><span>Топливо</span><strong>{litres.format(totalFuel)} л</strong><Icon name="chevron" className="chevron" />
        </button>
        {fuelOpen && <div id="fuel-popover" className="fuel-popover" role="region" aria-label="Остатки топлива">
          <div className="popover-title"><Icon name="fuel" /> Топливо в резервуарах <button type="button" onClick={onFuel} aria-label="Закрыть остатки топлива"><Icon name="close" /></button></div>
          {station.tanks.map((tank) => {
            const stock = station.fuels[tank.fuel];
            const percent = Math.round(tank.stockMl / tank.capacityMl * 100);
            return <div className="fuel-row" key={tank.id}>
              <strong>{stock.name}</strong>
              <span className={`fuel-track ${percent < 40 ? 'level-low' : percent < 60 ? 'level-mid' : 'level-good'}`}><span style={{ width: `${percent}%` }} /></span>
              <span>{percent}%</span><b>{litres.format(tank.stockMl / 1000)} л</b>
            </div>;
          })}
          <p>Остатки меняются после фактической заправки. Поставки доступны в зоне разгрузки.</p>
        </div>}
      </div>
      <div className="top-chip traffic-chip" title={`Мимо: ${stats.passed}; заехали: ${stats.visited}; обслужены: ${stats.purchases}; ждут: ${queueCount}; уехали из очереди: ${stats.leftQueue}; без обслуживания: ${stats.unserved}`}>
        <Icon name="traffic" /><span>Трафик</span><strong>{stats.passed} мимо · {queueCount} ждут</strong>
      </div>
      <div className="top-chip pumps-chip"><Icon name="pumps" /><strong>{station.pumps.filter(p=>p.status!=='building').length}/10</strong></div>
      <button type="button" className="menu-trigger" onClick={onMenu} aria-label="Открыть меню"><Icon name="menu" /></button>
    </header>
  );
}
