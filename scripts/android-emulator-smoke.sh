#!/usr/bin/env bash
set -euo pipefail

apk="android/app/build/outputs/apk/release/app-release.apk"
package="ru.azs.simulator"
mkdir -p artifacts/android-smoke
test -s "$apk"
on_exit() {
  local status="$?"
  if [ "$status" -ne 0 ]; then
    adb logcat -d -v brief > artifacts/android-smoke/failure-logcat.txt || true
    adb shell dumpsys activity activities > artifacts/android-smoke/failure-activity.txt || true
    adb exec-out screencap -p > artifacts/android-smoke/failure-screen.png || true
    echo "Android smoke failed with status $status" >&2
    grep -E 'FATAL EXCEPTION|Fatal signal|ANR in|Process .* has died|ActivityTaskManager.*(Start proc|Displayed)' artifacts/android-smoke/failure-logcat.txt | tail -30 >&2 || true
  fi
}
trap on_exit EXIT
adb wait-for-device
adb install -r "$apk"
adb shell settings put system accelerometer_rotation 0
adb logcat -c

for dimensions in 1280x720 800x400; do
  width="${dimensions%x*}"
  adb shell wm size "$dimensions"
  adb shell wm density 240
  adb shell am force-stop "$package" || true
  adb shell am start -n "$package/.MainActivity"
  sleep 12
  # Android can show its one-time immersive-mode tutorial after the activity
  # has started. Wait for a real scene before testing any in-game touch target.
  for attempt in 1 2 3 4; do
    adb exec-out screencap -p > "artifacts/android-smoke/scene-${dimensions}.png"
  scene_bytes=$(stat -c%s "artifacts/android-smoke/scene-${dimensions}.png")
    if [ "$scene_bytes" -gt 100000 ]; then break; fi
    echo "System overlay still visible at ${dimensions}; dismiss attempt ${attempt}" >&2
    if [ "$attempt" -eq 1 ]; then
      adb shell input keyevent KEYCODE_ENTER
    else
      adb shell input tap 930 285
    fi
    sleep 3
  done
  adb shell pidof "$package"
  test "$scene_bytes" -gt 100000
  for attempt in 1 2; do
    adb shell input tap "$((width - 48))" 44
    sleep 4
    adb exec-out screencap -p > "artifacts/android-smoke/menu-${dimensions}.png"
    if .venv-smoke/bin/python - "artifacts/android-smoke/scene-${dimensions}.png" "artifacts/android-smoke/menu-${dimensions}.png" <<'PY'
from PIL import Image, ImageChops, ImageStat
import sys

scene = Image.open(sys.argv[1]).convert('RGB')
menu = Image.open(sys.argv[2]).convert('RGB')
mean_change = sum(ImageStat.Stat(ImageChops.difference(scene, menu)).mean) / 3
print(f'Menu screen mean pixel change: {mean_change:.2f}')
sys.exit(0 if mean_change > 15 else 1)
PY
    then break; fi
    echo "Menu not visible at ${dimensions} after tap ${attempt}; retrying" >&2
  done
  .venv-smoke/bin/python - "artifacts/android-smoke/scene-${dimensions}.png" "artifacts/android-smoke/menu-${dimensions}.png" <<'PY'
from PIL import Image, ImageChops, ImageStat
import sys

scene = Image.open(sys.argv[1]).convert('RGB')
menu = Image.open(sys.argv[2]).convert('RGB')
mean_change = sum(ImageStat.Stat(ImageChops.difference(scene, menu)).mean) / 3
assert mean_change > 15, f'menu not visible: mean pixel change {mean_change:.2f}'
PY
  adb shell input keyevent KEYCODE_BACK || true
  sleep 1
done

adb logcat -d -v brief > artifacts/android-smoke/logcat.txt
if grep -E 'FATAL EXCEPTION|Fatal signal|ANR in ru.azs.simulator|chromium.*(Aw, Browser).*crash' artifacts/android-smoke/logcat.txt; then
  echo 'Android runtime crash or ANR found in logcat' >&2
  exit 1
fi
adb shell wm size reset
adb shell wm density reset
printf 'Android launch, touch menu, two resolutions and logcat: OK\n'
