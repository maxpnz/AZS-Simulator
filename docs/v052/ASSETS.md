# AZS Simulator 0.5.2 — игровые спрайты

Все 17 файлов в `src/assets/v052/` созданы по отдельности встроенным imagegen; референсный каталог и `draft_vehicle_png/` не использовались как источник пикселей. Мастера нормализованы: удалён разреженный шум альфа-канала, оставлен связный силуэт, прозрачные поля обрезаны, изображение уменьшено до разумного бюджета GPU. Итоговые файлы RGBA и не содержат надписей, рамок и нарисованной тени. Тень рисует движок.

Ориентация всех PNG: нос вправо. Anchor `(0.5, 0.5)`, масштаб manifest `1`. В игровом мире ширина и длина берутся из `vehicleModels.ts`, а не из размера PNG; поворот задаётся `vehicle.angle`. Размеры и пути каждого файла проверяются manifest `src/ui/scene/vehicleManifest.ts` и тестом `v052.test.ts`.

| Модель | Файл | Пиксели | Основной цвет |
|---|---|---:|---|
| city-hatch | `01_city-hatch.png` | 640×341 | серебро |
| budget-sedan | `02_budget-sedan.png` | 640×332 | серебро |
| family-sedan | `03_family-sedan.png` | 640×317 | синий |
| business-sedan | `04_business-sedan.png` | 640×304 | чёрный |
| estate-wagon | `05_estate-wagon.png` | 640×302 | серебро |
| compact-crossover | `06_compact-crossover.png` | 640×371 | оранжевый |
| mid-suv | `07_mid-suv.png` | 640×321 | серый |
| full-suv | `08_full-suv.png` | 640×320 | чёрный |
| minivan | `09_minivan.png` | 640×325 | серебро |
| sport-coupe | `10_sport-coupe.png` | 640×336 | красный |
| pickup | `11_pickup.png` | 640×285 | серебро |
| delivery-van | `12_delivery-van.png` | 640×268 | белый |
| medium-truck | `13_medium-truck.png` | 960×426 | белый |
| heavy-truck | `14_heavy-truck.png` | 960×317 | белый |
| coach-bus | `15_coach-bus.png` | 960×277 | белый/синий |
| semi-trailer | `16_semi-trailer.png` | 960×234 | белый/синий |
| fuel-tanker | `17_fuel-tanker.png` | 960×331 | белый/серебро/красный |

У 12 легковых и малых коммерческих моделей сохраняется цветовая вариативность игрового `vehicle.color` через мягкое тонирование текстуры. Крупный транспорт использует перечисленные фиксированные варианты; его исходное значение `vehicle.color` в сохранении не изменяется.

## Промты генерации

Общий промт: «Production game vehicle sprite, one complete contemporary vehicle on genuinely transparent RGBA background, almost directly overhead orthographic camera (~85°), front points right, soft upper-left lighting, realistic roof/windows/wheels/lights, tight safe bounds, no ground, cast shadow, labels, text, border, tile or other vehicle». Отдельные промты задавали модель и основной цвет из таблицы; для универсала использован уточнённый промт с прямой камерой 90° и запретом белой каймы. Обработка исходных файлов описана в `scripts/prepare-v052-sprites.py`; финальные PNG не зависят от наличия мастеров в окружении сборки.

Для ручной проверки набора: [контактный лист](sprites-contact-sheet.png). Для финальной приёмки нужен просмотр на Android WebView в игровом масштабе и на разных DPI.
