const ALLOWED = /^[\p{L}\p{M}\p{N} .,!?:;()\-–—'«»№]+$/u;
export function normalizeStationName(value:unknown):string {
  if(typeof value!=='string')return 'АЗС';
  const clean=Array.from(value).filter(character=>ALLOWED.test(character)).join('').trim();
  const segments=typeof Intl.Segmenter==='function'
    ? Array.from(new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(clean),part=>part.segment)
    : Array.from(clean);
  return segments.slice(0,20).join('').trim()||'АЗС';
}
