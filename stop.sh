#!/bin/bash
# 停止可视化日记服务（配合 start.sh 使用）
cd "$(dirname "$0")"

stopped=0

# 1) 优先按 start.sh 记录的 PID 停止
if [ -f .server.pid ]; then
  PID=$(cat .server.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    # 最多等 5 秒优雅退出
    for _ in 1 2 3 4 5; do
      kill -0 "$PID" 2>/dev/null || break
      sleep 1
    done
    # 仍存活则强制
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null
    fi
    echo "已停止 (PID $PID)"
    stopped=1
  fi
  rm -f .server.pid
fi

# 2) 兜底：清理仍占用 8730 端口的进程（手动 uvicorn 启动等情况）
if lsof -ti:8730 >/dev/null 2>&1; then
  PIDS=$(lsof -ti:8730)
  kill $PIDS 2>/dev/null
  sleep 1
  lsof -ti:8730 >/dev/null 2>&1 && kill -9 $(lsof -ti:8730) 2>/dev/null
  echo "已清理端口 8730 上的残留进程: $PIDS"
  stopped=1
fi

if [ "$stopped" -eq 0 ]; then
  echo "服务本就未在运行"
fi
