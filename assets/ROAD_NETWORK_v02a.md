# Дорожная сеть v0.2-A / v0.2-B

Координаты узлов находятся в общей системе сцены 2000 × 1200. Узлы и связи определены в `src/game/domain/roadNetwork.ts`; `src/ui/scene/roadNetwork.ts` их экспортирует для сцены.

- Ближнее направление (слева направо): `east_lane_1_west → entrance_decision → east_lane_1_east` и параллельная `east_lane_2_west → east_lane_2_east`.
- Встречное направление (справа налево): `west_lane_1_east → west_lane_1_west` и `west_lane_2_east → west_lane_2_west`. Узлов поворота через разделитель нет.
- Маршрут заезда с прилегающей полосы: `entrance_decision → entrance_curve → entrance → queue_split`.
- К первой колонке: `queue_split → pump_1_approach → pump_1`; ко второй: `queue_split → pump_2_approach → pump_2`.
- После обслуживания или ухода из очереди: `pump_*_approach → exit_lane → exit → exit_merge → east_lane_1_east`.

В v0.2-B автомобили проходят эти маршруты с ограниченной скоростью. Очередь и обслуживание рассчитываются в игровом времени. Поставки и бензовозы пока отсутствуют.
