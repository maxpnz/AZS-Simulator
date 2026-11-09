import { useEffect, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { version as currentVersion } from '../../package.json';
import { findApkUpdate, type ApkUpdate } from '../platform/githubUpdates';

export function UpdateNotice() {
  const [update, setUpdate] = useState<ApkUpdate | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    void findApkUpdate(import.meta.env.VITE_GITHUB_REPO, currentVersion).then((available) => {
      if (active) setUpdate(available);
    });
    return () => { active = false; };
  }, []);

  if (!update) return null;
  return (
    <div className="update-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-dialog">
        <span className="eyebrow">НОВАЯ ВЕРСИЯ</span>
        <h2 id="update-title">АЗС Simulator {update.version}</h2>
        <p>Обновление опубликовано в GitHub Releases. Скачайте APK и подтвердите установку на телефоне.</p>
        <div className="update-actions">
          <button type="button" className="update-later" onClick={() => setUpdate(null)}>Позже</button>
          <button type="button" className="update-now" onClick={() => void Browser.open({ url: update.downloadUrl })}>Скачать APK</button>
        </div>
      </div>
    </div>
  );
}
