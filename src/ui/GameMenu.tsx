import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Icon } from './Icon';

interface Props { onClose: () => void }

export function GameMenu({ onClose }: Props) {
  const exit = () => {
    if (Capacitor.getPlatform() === 'android') void CapacitorApp.exitApp();
    else onClose();
  };

  return <div className="menu-backdrop" role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
    <div className="menu-card">
      <button type="button" className="menu-close" onClick={onClose} aria-label="Закрыть меню"><Icon name="close" /></button>
      <div className="menu-kicker">АЗС SIMULATOR · v0.1.1</div>
      <h2 id="game-menu-title">Меню игры</h2>
      <p>Симуляция приостановлена.</p>
      <button type="button" className="menu-continue" onClick={onClose}><Icon name="play" /> Продолжить</button>
      <button type="button" className="menu-exit" onClick={exit}><Icon name="exit" /> Выйти из приложения</button>
    </div>
  </div>;
}
