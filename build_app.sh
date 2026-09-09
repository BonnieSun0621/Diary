#!/bin/bash
# 打包 macOS .app：产出 dist/Diary.app 并压缩为 Diary-macOS.zip
set -e
cd "$(dirname "$0")"
source .venv/bin/activate

echo '[1/5] PyInstaller 打包后端...'
.venv/bin/pyinstaller --noconfirm --clean --name diary-server \
  --add-data 'frontend:frontend' \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.loops.asyncio \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.http.h11_impl \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.lifespan.off \
  backend/__main__.py >/tmp/pyi.log 2>&1 || { tail -20 /tmp/pyi.log; exit 1; }

echo '[2/5] 生成图标 icns...'
python3 - <<'ICONPY'
import pathlib
sizes = [16, 32, 64, 128, 256, 512]
out = pathlib.Path('dist/diary.iconset')
out.mkdir(parents=True, exist_ok=True)
src = pathlib.Path('frontend/icon.svg').resolve()
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
jobs = [(s, s, f'icon_{s}x{s}.png') for s in sizes] + \
       [(s, s*2, f'icon_{s}x{s}@2x.png') for s in (16, 32, 128, 256)]
for logical, px, fname in jobs:
    subprocess_run = [
        chrome, '--headless', '--disable-gpu',
        f'--screenshot={out / fname}',
        f'--window-size={px},{px}',
        '--default-background-color=00000000',
        f'file://{src}',
    ]
    import subprocess
    subprocess.run(subprocess_run, check=True, capture_output=True)
print('iconset pngs done')
ICONPY
iconutil -c icns dist/diary.iconset -o dist/diary.icns

echo '[3/5] 组装 Diary.app...'
APP=dist/Diary.app
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp dist/diary.icns "$APP/Contents/Resources/diary.icns"
cp -R dist/diary-server "$APP/Contents/MacOS/diary-server"
cat > "$APP/Contents/MacOS/Diary" <<'LAUNCH'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/diary-server/diary-server"
LAUNCH
chmod +x "$APP/Contents/MacOS/Diary"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Diary</string>
  <key>CFBundleDisplayName</key><string>拾光日记</string>
  <key>CFBundleIdentifier</key><string>com.bonnie.diary</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>diary</string>
  <key>CFBundleExecutable</key><string>Diary</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

echo '[4/5] 冒烟测试 .app 内可执行（3 秒起服务后关闭）...'
tmpd=$(mktemp -d)
DIARY_DATA_DIR=$tmpd "$APP/Contents/MacOS/diary-server/diary-server" > /tmp/app_smoke.log 2>&1 &
SMOKE_PID=$!
sleep 3
if curl -sf http://127.0.0.1:8730/ >/dev/null; then echo '  smoke OK'; else echo '  smoke FAILED'; tail -5 /tmp/app_smoke.log; fi
kill $SMOKE_PID 2>/dev/null
rm -rf $tmpd

echo '[5/5] 压缩分发包...'
cd dist && rm -f Diary-macOS.zip && zip -qr Diary-macOS.zip Diary.app && cd ..
echo '完成 → dist/Diary.app + dist/Diary-macOS.zip'
