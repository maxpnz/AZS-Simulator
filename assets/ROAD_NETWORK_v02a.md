# Дорожная сеть v0.2-A

Координаты узлов находятся в общей системе сцены 2000 × 1200. Полный список и связи: src/ui/scene/roadNetwork.ts.

- Ближнее направление (слева направо): east_lane_1_west → entrance_decision → east_lane_1_east и параллельная east_lane_2_west → east_lane_2_east.
- Встречное направление (справа налево): west_lane_1_east → west_lane_1_west и west_lane_2_east → west_lane_2_west. Узлов поворота через разделитель нет.
- Маршрут заезда: entrance_decision → entrance_curve → entrance → queue_split.
- К первой колонке: queue_split → pump_1_approach → pump_1 → exit_lane; ко второй: queue_split → pump_2_approach → pump_2 → exit_lane.
- Возврат: exit_lane → exit → exit_merge → east_lane_1_east.

Узлы описывают будущие маршруты. В v0.2-A автомобили, очереди, продажи и поставки не запускаются.
