"""打包版启动器：起本地服务 → 打开浏览器 → 前台运行。
用法（PyInstaller 生成后）：双击 Diary.app 即可。"""
import threading, time, webbrowser
import uvicorn

from backend.app import app

HOST, PORT = "127.0.0.1", 8730

def _open_browser():
    time.sleep(1.2)   # 等服务就绪
    webbrowser.open(f"http://{HOST}:{PORT}")

if __name__ == "__main__":
    threading.Thread(target=_open_browser, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
