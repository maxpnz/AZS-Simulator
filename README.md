# АЗС Simulator

Текущая выпущенная версия — **v0.3.0**; ручная приёмка игроком ожидается. Последняя принятая игроком версия — **v0.2.8**. Требования к игре, состояние объектов, экономика и известные дефекты собраны в [своде правил](docs/GAME_RULES-2.md). При разработке игровых функций обновляйте его вместе с кодом.

Стек: TypeScript, React, PixiJS, Vite и Capacitor. Требуется Node.js 22; для локальной Android-сборки также Java 21 и Android SDK API 36.

Команды:

- Установка: npm ci
- Запуск браузерной версии: npm run dev
- Проверка типов и тесты: npm run typecheck; npm test
- Веб-сборка: npm run build
- Синхронизация Android-проекта: npm run android:sync
- Отладочный APK при установленном SDK: npm run android:apk:debug

Подписанный APK и web-архив v0.3.0 доступны в [GitHub Releases](https://github.com/maxpnz/AZS-Simulator/releases/tag/v0.3.0).
