import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioManager';

type ToastKind = 'success' | 'error' | 'info';
interface ToastMessage { id: number; text: string; kind: ToastKind }
let nextId = 0;
const listeners = new Set<(message: ToastMessage) => void>();

export function toast(text: string, kind: ToastKind = 'info') {
  const message = { id: ++nextId, text, kind };
  if(kind==='error')audio.play('ui_error');
  else if(kind==='success')audio.play('ui_confirm');
  for (const listener of listeners) listener(message);
}

export function Toast() {
  const [message, setMessage] = useState<ToastMessage>();
  useEffect(() => {
    listeners.add(setMessage);
    return () => { listeners.delete(setMessage); };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);
  return <div className="toast-region" role="status" aria-live="polite">
    {message && <div key={message.id} className={`game-toast ${message.kind}`}>{message.text}</div>}
  </div>;
}
