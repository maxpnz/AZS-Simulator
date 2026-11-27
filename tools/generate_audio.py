"""Original procedural effects for AZS Simulator. CC0-1.0."""
from pathlib import Path
import math, random, struct, subprocess, wave
ROOT=Path(__file__).resolve().parents[1]/'public/audio'
RATE=22050

def write(path, duration, synth):
    count=int(duration*RATE)
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
        chunk=[]
        for i in range(count):
            t=i/RATE
            value=max(-.92,min(.92,synth(t,i)))
            chunk.append(struct.pack('<h',int(value*32767)))
            if len(chunk)==4096:f.writeframes(b''.join(chunk));chunk=[]
        if chunk:f.writeframes(b''.join(chunk))

def note(freq,t):
    return math.sin(math.tau*freq*t)+.17*math.sin(math.tau*freq*2*t)

def music(name,notes,seed):
    random.seed(seed)
    phase=[random.random()*math.tau for _ in range(5)]
    duration=32
    temp=ROOT/'music'/f'{name}.wav'
    def sound(t,i):
        # Four 8-second chord cells repeat exactly at the loop boundary.
        beat=int(t/8)%4; local=t%8
        chord=notes[beat]
        pad=sum(math.sin(math.tau*f*t+p) for f,p in zip(chord,phase)) / len(chord)
        pulse=math.sin(math.tau*chord[0]/2*t)*(.5+.5*math.cos(math.tau*local/2))
        bell=math.sin(math.tau*chord[2]*2*t)*math.exp(-((local%2)/.55))
        seam=max(0,min(1,t/.08,(duration-t)/.08))
        return (.10*pad+.022*pulse+.012*bell)*seam
    write(temp,duration,sound)
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(temp),'-c:a','libvorbis','-q:a','4',str(temp.with_suffix('.ogg'))],check=True)
    temp.unlink()

sounds={
 'ui_select':(.12,560,'tone'),'ui_open':(.18,470,'up'),'ui_close':(.16,440,'down'),
 'construction':(.55,310,'click'),'upgrade_complete':(.45,780,'up'),
 'ui_click':(.08,620,'tone'),'ui_confirm':(.22,740,'up'),'ui_error':(.28,280,'down'),
 'ui_notification':(.38,500,'up'),'ui_purchase':(.4,760,'up'),'ui_warning':(.5,380,'down'),
 'cash_register':(.3,1050,'up'),'repair_complete':(.52,670,'up'),
 'pump_nozzle_pickup':(.23,400,'click'),'pump_nozzle_return':(.23,320,'click'),
 'pump_complete':(.4,540,'up'),'pump_fueling':(2,115,'hum'),'repair_tools':(.5,410,'click'),
 'vehicle_start':(.8,95,'hum'),'vehicle_idle':(2,75,'hum'),'vehicle_pass':(1.2,110,'hum'),
 'vehicle_stop':(.75,85,'down'),'vehicle_horn_1':(.35,440,'tone'),'vehicle_horn_2':(.45,370,'tone'),
 'truck_arrival':(1.5,65,'hum'),'truck_brake':(.55,145,'noise'),'truck_idle':(2,58,'hum'),'truck_drive':(2,72,'hum'),
 'fuel_unloading':(2,120,'hum'),'goods_unloading':(.7,280,'click'),
 'store_door':(.4,620,'click'),'cafe_door':(.4,510,'click'),'ambient_station':(3,65,'noise')}
for name,(duration,freq,kind) in sounds.items():
    rng=random.Random(name)
    # Deterministic, filtered random texture. Loop files start/end at silence to avoid clicks.
    noise=[rng.uniform(-1,1) for _ in range(int(duration*RATE))]
    smooth=0
    def synth(t,i):
        global smooth
        progress=t/duration
        edge=min(1,t/.045,(duration-t)/.045)
        env=max(0,edge)*(1-progress if kind not in ('hum','noise') else 1)
        shift=(1+.35*progress) if kind=='up' else (1-.35*progress) if kind=='down' else 1
        wave=math.sin(math.tau*freq*shift*t)
        smooth=.94*smooth+.06*noise[i]
        if kind=='noise':return .065*smooth*env
        if kind=='hum':return (.075*wave+.055*smooth)*env
        if kind=='click':return (.13*wave+.12*smooth)*env
        return .16*wave*env
    temp=ROOT/'sfx'/f'{name}.wav'
    write(temp,duration,synth)
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(temp),'-c:a','libvorbis','-b:a','48k','-ac','1',str(temp.with_suffix('.ogg'))],check=True)
    temp.unlink()
