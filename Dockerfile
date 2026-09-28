# 拾光日记 · Docker 镜像（FastAPI 后端 + 前端静态页，单容器单端口 8730）
# 数据不进镜像：运行时挂载宿主机数据目录（见 docker-compose.yml）
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DIARY_DATA_DIR=/data

WORKDIR /app

# 先装依赖（利用层缓存：改代码不重装依赖）
COPY requirements-docker.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 应用代码：backend（/api/*）+ frontend（静态页，app.py 挂载于 BASE_DIR/frontend）
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

# 数据挂载点 + 非 root 运行用户（Docker Desktop/VirtioFS 自动处理宿主机 uid 映射，可正常读写）
RUN mkdir -p /data \
    && useradd --create-home --uid 1000 diary \
    && chown -R diary:diary /data
USER diary

VOLUME /data
EXPOSE 8730

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8730/', timeout=4).status==200 else 1)"

CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8730"]
