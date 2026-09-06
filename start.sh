#!/bin/bash
# 启动可视化日记（本地 http://localhost:8730）
cd "$(dirname "$0")"
source .venv/bin/activate
exec python -m uvicorn backend.app:app --host 127.0.0.1 --port 8730
