import { Icon } from './Icon';

const futureSections = [
  ['tag', 'Цены'], ['truck', 'Закупки'], ['fuel', 'Топливо'],
  ['chart', 'Развитие'], ['coins', 'Финансы'], ['report', 'Отчёты'], ['settings', 'Настройки'],
] as const;

export function SideNav() {
  return <nav className="side-nav" aria-label="Разделы игры">
    <div className="nav-current"><Icon name="home" /><span>Обзор</span></div>
    {futureSections.map(([icon, title]) => <div className="nav-future" key={title} aria-disabled="true" title="В следующих версиях"><Icon name={icon} /><span>{title}</span></div>)}
  </nav>;
}
