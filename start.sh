#!/bin/bash
# 启动可视化日记（本地 http://localhost:8730）
# 后台运行，日志写入 /tmp/diary_server.log，PID 记录到 .server.pid（供 stop.sh 使用）
cd "$(dirname "$0")"
source .venv/bin/activate

# 已在运行则不重复启动
if [ -f .server.pid ] && kill -0 "$(cat .server.pid)" 2>/dev/null; then
  echo "已在运行中 (PID $(cat .server.pid)) → http://localhost:8730"
  exit 0
fi
# 兜底：端口被占（可能是无 pid 文件的残留进程）
if lsof -ti:8730 >/dev/null 2>&1; then
  echo "端口 8730 已被占用 (PID $(lsof -ti:8730))，如需重启请先 ./stop.sh"
  exit 1
fi

nohup python -m uvicorn backend.app:app --host 127.0.0.1 --port 8730 > /tmp/diary_server.log 2>&1 &
echo $! > .server.pid
sleep 1
if kill -0 "$(cat .server.pid)" 2>/dev/null; then
  echo "已启动 (PID $(cat .server.pid)) → http://localhost:8730"
  echo "日志: /tmp/diary_server.log"
else
  echo "启动失败，日志如下："
  tail -20 /tmp/diary_server.log
  rm -f .server.pid
  exit 1
fi
