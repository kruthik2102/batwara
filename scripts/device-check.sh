#!/usr/bin/env bash
# Installs the debug APK on the running emulator and drives it with scripts/device-check.mjs.
set -u
export PATH="${ANDROID_HOME:-/usr/local/lib/android/sdk}/platform-tools:$PATH"
OUT=device-shots
mkdir -p "$OUT"
adb wait-for-device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk 2>&1 | tee "$OUT/install.txt"
adb logcat -c || true
node scripts/device-check.mjs "$OUT" 2>&1 | tee "$OUT/run.txt"
status=${PIPESTATUS[0]}
adb logcat -d -v time 2>/dev/null | grep -iE "chromium|Capacitor|AndroidRuntime|batwara|WebView" | tail -400 > "$OUT/logcat.txt" || true
exit $status
