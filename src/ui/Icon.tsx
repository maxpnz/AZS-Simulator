import type { SVGProps } from 'react';

type IconName = 'calendar' | 'clock' | 'wallet' | 'fuel' | 'traffic' | 'pumps' | 'pause' | 'play' | 'menu' | 'close' | 'exit' | 'home' | 'tag' | 'truck' | 'chart' | 'coins' | 'report' | 'settings' | 'chevron' | 'build' | 'people' | 'megaphone' | 'tasks';

const paths: Record<IconName, string> = {
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4M8 13h2M14 13h2M8 17h2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  wallet: 'M4 6h15v14H4zM4 6V4h13M15 12h5v4h-5a2 2 0 0 1 0-4Z',
  fuel: 'M4 21V5h11v16M3 21h13M6 9h7v5H6zM15 8l3 3v7a2 2 0 0 0 4 0v-6l-3-3',
  traffic: 'M5 19V5M12 19V5M19 19V5M2 8l3-3 3 3M9 16l3 3 3-3M16 8l3-3 3 3',
  pumps: 'M4 19h16M6 19V8h5v11M13 19V5h5v14M6 11h5M13 9h5',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  play: 'm8 5 11 7-11 7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M5 5l14 14M19 5 5 19',
  exit: 'M10 4H4v16h6M14 4h6v16h-6M8 12h10M15 9l3 3-3 3',
  home: 'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',
  tag: 'M3 12V4h8l10 10-7 7L3 12ZM8 8h.01',
  truck: 'M2 6h12v11H2zM14 10h4l4 4v3h-8M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  chart: 'M3 20h18M5 16l5-5 4 3 5-8M16 6h3v3',
  coins: 'M12 7c4 0 7-1 7-3s-3-3-7-3-7 1-7 3 3 3 7 3ZM5 4v5c0 2 3 3 7 3s7-1 7-3V4M5 9v5c0 2 3 3 7 3s7-1 7-3V9M5 14v5c0 2 3 3 7 3s7-1 7-3v-5',
  report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  chevron: 'm8 10 4 4 4-4',
  build: 'M3 21h18M6 21V8h12v13M4 8h16M12 8V3M8 3h8M8 12h2M14 12h2M8 16h2M14 16h2',
  people: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5v2',
  megaphone: 'M3 10h5l11-5v14L8 14H3zM8 14l2 7h4M21 9v6',
  tasks: 'M5 5h14v16H5zM9 3h6v4H9zM8 12l2 2 4-4M8 18h8',
};

interface Props extends SVGProps<SVGSVGElement> { name: IconName }

export function Icon({ name, ...props }: Props) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
