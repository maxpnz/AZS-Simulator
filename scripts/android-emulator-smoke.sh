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
  for attempt in 1 2 3 4 5; do
    adb exec-out screencap -p > "artifacts/android-smoke/scene-${dimensions}.png"
    scene_bytes=$(stat -c%s "artifacts/android-smoke/scene-${dimensions}.png")
    if [ "$scene_bytes" -gt 100000 ] && .venv-smoke/bin/python - "artifacts/android-smoke/scene-${dimensions}.png" <<'PY'
from PIL import Image
import sys

image = Image.open(sys.argv[1]).convert('RGB')
red, green, blue = image.getpixel((image.width // 2, image.height // 3))
# The system immersive-mode tutorial has a pale, uniform center panel.
sys.exit(1 if min(red, green, blue) > 200 and max(red, green, blue) - min(red, green, blue) < 30 else 0)
PY
    then break; fi
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
  .venv-smoke/bin/python - "artifacts/android-smoke/scene-${dimensions}.png" <<'PY'
from PIL import Image
import sys

image = Image.open(sys.argv[1]).convert('RGB')
rgb = image.getpixel((image.width // 2, image.height // 3))
assert not (min(rgb) > 200 and max(rgb) - min(rgb) < 30), 'system tutorial covers the game'
PY
  # Edge gestures can swallow taps near the top/right border in immersive mode.
  # Probe several points inside the same visible menu button.
  for point in "$((width - 60)) 65" "$((width - 70)) 50" "$((width - 48)) 44"; do
    read -r tap_x tap_y <<< "$point"
    adb shell input tap "$tap_x" "$tap_y"
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
    echo "Menu not visible at ${dimensions} after tap ${tap_x},${tap_y}; retrying" >&2
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
