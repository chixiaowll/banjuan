#!/bin/bash
# Simulator self-test of the iPad-only features (src/selftest.ts).
#   1. npx vite build --mode selftest && npx cap copy ios
#   2. xcodebuild -workspace ios/App/App.xcworkspace -scheme App -sdk iphonesimulator \
#        -destination "platform=iOS Simulator,id=<device>" -derivedDataPath <build-dir> build
#   3. scripts/simulator-selftest.sh <device-udid> <build-dir> <fixtures-dir> <out-dir> [quicklook|share|picker|none]
# Fixtures: a PDF and an EPUB (any names). Prints the report; screenshots go to <out-dir>.
# Rebuild normally (npx vite build && npx cap copy ios) afterwards: the self-test
# bundle must not stay in the iOS project.
set -e
DEV=$1; BUILD=$2; FIX=$3; OUT=$4; FINAL=${5:-none}
mkdir -p "$OUT"
xcrun simctl boot "$DEV" 2>/dev/null || true
xcrun simctl terminate "$DEV" com.banjuan.app >/dev/null 2>&1 || true
xcrun simctl install "$DEV" "$BUILD/Build/Products/Debug-iphonesimulator/App.app"
DATA=$(xcrun simctl get_app_container "$DEV" com.banjuan.app data)
mkdir -p "$DATA/Documents/selftest-fixtures" && cp "$FIX"/* "$DATA/Documents/selftest-fixtures/"
echo "{\"final\":\"$FINAL\"}" > "$DATA/Documents/selftest-config.json"
rm -f "$DATA/Documents/selftest-report.json"
xcrun simctl launch "$DEV" com.banjuan.app >/dev/null
R="$DATA/Documents/selftest-report.json"; seen=""
for _ in $(seq 1 150); do
  sleep 2
  [ -f "$R" ] || continue
  s=$(python3 -c "import json;print(json.load(open('$R')).get('shot') or '')" 2>/dev/null || true)
  if [ -n "$s" ] && [ "$s" != "$seen" ]; then sleep 2; xcrun simctl io "$DEV" screenshot "$OUT/$s.png" >/dev/null 2>&1; seen=$s; fi
  done=$(python3 -c "import json;print(json.load(open('$R'))['done'])" 2>/dev/null || true)
  if [ "$done" = "True" ] && { [ "$seen" = "$FINAL" ] || [ "$FINAL" = "none" ]; }; then break; fi
done
python3 -c "
import json
d = json.load(open('$R'))
for s in d['steps']: print('PASS' if s['ok'] else 'FAIL', s['name'], '-', json.dumps(s.get('detail'), ensure_ascii=False)[:240])"
