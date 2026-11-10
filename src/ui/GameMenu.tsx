import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Icon } from './Icon';
const sections = [
  ['Обзор','Трафик, продажи и остатки'],['Цены','Редактор цен на стеле'],['Закупки','Заказ бензовоза'],['Топливо','Остатки в резервуарах'],
  ['Развитие','Бригады и строительство'],['Финансы','Появятся в следующих версиях'],['Отчёты','Текущие продажи и трафик'],
  ['Настройки','Жесты: один палец — сдвиг; два пальца — масштаб'],
  ['Строительство','Бригады и монтажные места'],['Сохранить','Записать текущее состояние'],['Загрузить','Вернуться к последнему сохранению'],['Персонал','Появится в следующих версиях'],
  ['Маркетинг','Появится в следующих версиях'],['Задачи','Появятся в следующих версиях'],
] as const;
interface Props { onClose: () => void; onSection: (name: string) => void }
export function GameMenu({ onClose, onSection }: Props) {
  const exit = () => { if (Capacitor.getPlatform() === 'android') void CapacitorApp.exitApp(); else onClose(); };
  return <div className="menu-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <nav className="menu-card" role="dialog" aria-label="Меню игры">
      <button type="button" className="menu-close" onClick={onClose} aria-label="Закрыть меню"><Icon name="close" /></button>
      <div className="menu-kicker">АЗС SIMULATOR · v0.2.6</div><h2>Меню</h2>
      <div className="menu-sections">{sections.map(([name,description]) =>
        <button type="button" key={name} onClick={() => { onSection(name); onClose(); }}><strong>{name}</strong><small>{description}</small></button>)}</div>
      <button type="button" className="menu-exit" onClick={exit}><Icon name="exit" /> Выйти из приложения</button>
    </nav>
  </div>;
}
