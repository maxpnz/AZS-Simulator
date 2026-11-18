import type {Sku} from '../game/domain/commerce';

/** Small scalable illustrations drawn in the UI so product cards need no network images. */
export function ProductArt({sku}:{sku:Sku}){
  const common={stroke:'#e9fff2',strokeWidth:2,strokeLinejoin:'round' as const};
  return <svg className={`product-art art-${sku}`} viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="87" rx="35" ry="6" fill="#0008" />
    {sku==='water'&&<><rect x="42" y="12" width="16" height="10" rx="2" fill="#279ff0" {...common}/><path d="M42 21 L37 32 L33 71 Q32 82 42 84 L58 84 Q68 82 67 71 L63 32 L58 21Z" fill="#84d8ff" {...common}/><path d="M35 48 Q50 54 65 48M34 60 Q50 66 66 60M35 71 Q50 76 65 71" fill="none" stroke="#e4faff" strokeWidth="3"/></>}
    {sku==='hotdog'&&<><path d="M15 57 Q24 35 71 42 Q84 46 87 63 Q75 80 34 76 Q22 73 15 57Z" fill="#e7a35c" {...common}/><path d="M21 56 Q35 42 74 49 Q82 54 80 63 Q59 70 28 66Z" fill="#b9432d" {...common}/><path d="M25 55 Q39 61 47 53 Q57 47 65 57 Q71 64 78 57" fill="none" stroke="#ffd434" strokeWidth="5" strokeLinecap="round"/></>}
    {sku==='chocolate'&&<><g transform="rotate(-15 50 50)"><rect x="23" y="20" width="56" height="59" rx="3" fill="#592719" {...common}/>{[0,1,2].flatMap(row=>[0,1,2].map(col=><rect key={`${row}-${col}`} x={27+col*17} y={24+row*17} width="15" height="15" rx="2" fill="#9d573b" stroke="#4b2119" strokeWidth="2"/>))}</g></>}
    {sku==='snacks'&&<><path d="M26 15 L77 19 L71 79 Q51 86 28 78Z" fill="#f4b81d" {...common}/><path d="M28 30 Q50 37 74 28 M29 67 Q50 74 72 66" fill="none" stroke="#fff3aa" strokeWidth="4"/><circle cx="52" cy="50" r="13" fill="#ee8b14" stroke="#ffe693" strokeWidth="3"/><path d="M40 50 Q53 40 64 50" fill="none" stroke="#fff3bd" strokeWidth="3"/></>}
    {sku==='coffee'&&<><path d="M21 39 H72 V68 Q71 82 47 82 Q23 81 21 68Z" fill="#f7eee4" {...common}/><path d="M71 46 Q88 42 86 56 Q85 67 70 66" fill="none" stroke="#f7eee4" strokeWidth="7"/><ellipse cx="47" cy="39" rx="25" ry="8" fill="#a85d31" stroke="#fff4e8" strokeWidth="3"/><path d="M43 26 Q35 20 42 12 M55 26 Q48 19 55 11" fill="none" stroke="#d8f0e5" strokeWidth="3" strokeLinecap="round"/></>}
    {sku==='milk'&&<><path d="M30 28 L38 15 H67 L74 28 V81 H30Z" fill="#e7f9ff" {...common}/><path d="M30 28 H74 L64 39 H30Z" fill="#91caff" stroke="#eef9ff" strokeWidth="2"/><rect x="33" y="43" width="38" height="21" rx="3" fill="#36a5e2"/><path d="M50 47 Q42 56 50 60 Q58 56 50 47Z" fill="white"/><path d="M38 15 H67" stroke="#97b7c8" strokeWidth="4"/></>}
    {sku==='cake'&&<><path d="M18 72 L29 40 Q56 34 78 49 L82 72 Q53 82 18 72Z" fill="#f3dec2" {...common}/><path d="M22 63 Q52 68 80 62" fill="none" stroke="#6b3026" strokeWidth="8"/><path d="M28 43 Q53 36 76 49" fill="none" stroke="#6e3327" strokeWidth="10"/><circle cx="53" cy="29" r="9" fill="#dc2842" stroke="#ffb3b9" strokeWidth="2"/><path d="M54 20 L58 13" stroke="#4ba65b" strokeWidth="3"/></>}
    {sku==='pie'&&<><path d="M13 67 Q31 30 71 37 Q87 44 88 63 Q61 84 13 67Z" fill="#d98639" {...common}/><path d="M23 65 Q38 45 68 48 Q77 50 81 61" fill="none" stroke="#ffd482" strokeWidth="5"/><path d="M29 55 Q41 61 49 53 M52 46 Q64 54 72 45" fill="none" stroke="#a85a2c" strokeWidth="5" strokeLinecap="round"/></>}
  </svg>;
}
