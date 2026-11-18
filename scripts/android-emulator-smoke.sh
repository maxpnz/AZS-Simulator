#!/usr/bin/env bash
set -euo pipefail

apk="android/app/build/outputs/apk/release/app-release.apk"
package="ru.azs.simulator"
mkdir -p artifacts/android-smoke
test -s "$apk"
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
  adb shell dumpsys activity activities | grep -q "$package/.MainActivity"
  adb exec-out screencap -p > "artifacts/android-smoke/scene-${dimensions}.png"
  test -s "artifacts/android-smoke/scene-${dimensions}.png"
  adb shell input tap "$((width - 30))" 32
  sleep 3
  adb exec-out screencap -p > "artifacts/android-smoke/menu-${dimensions}.png"
  test -s "artifacts/android-smoke/menu-${dimensions}.png"
  test "$(sha256sum "artifacts/android-smoke/scene-${dimensions}.png" | cut -d ' ' -f 1)" != "$(sha256sum "artifacts/android-smoke/menu-${dimensions}.png" | cut -d ' ' -f 1)"
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
