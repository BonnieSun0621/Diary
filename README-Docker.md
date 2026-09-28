# 拾光日记 · Docker 使用说明

> 与原生 `start.sh` 方式**共用同一个数据库**（`~/Library/Application Support/Diary/diary.db`），数据完全保留，两种方式可随时互换——但**不能同时运行**（都用 8730 端口）。

## 快速开始

```bash
cd /Users/bonnie/myself/diary
./stop.sh                        # ① 停原生服务（如正在运行）
docker compose up -d --build     # ② 构建并后台启动
# ③ 打开 http://localhost:8730
```

## 日常命令

```bash
docker compose logs -f           # 跟踪日志（Ctrl+C 退出，不影响运行）
docker compose ps                # 运行状态（healthy 为正常）
docker compose stop              # 停止（保留容器）
docker compose start             # 再启动
docker compose down              # 停止并删除容器（数据在宿主机，不受影响）
docker compose up -d             # 启动（已有镜像，不重新构建）
```

## 更新代码后

```bash
git pull                         # 或本地改完代码
docker compose up -d --build     # 重新构建镜像并滚动替换容器（秒级中断）
```

## 数据与备份

- 数据库就在宿主机原位置：`~/Library/Application Support/Diary/diary.db`（容器只是挂载读写，删容器/镜像/重建都不动它）
- 快照备份（建议偶尔做一次，Time Machine 也会备这个目录）：

```bash
sqlite3 ~/Library/"Application Support"/Diary/diary.db \
  ".backup ~/Desktop/diary-$(date +%F).db"
```

- 应用内备份通用：设置页 →「导出备份 JSON」，可在 Docker / 原生 / 换电脑之间恢复
- 切回原生模式：`docker compose down && ./start.sh`（数据同一份，无缝切换）

## 注意事项

1. **端口互斥**：Docker 与原生二选一。`docker compose up` 前先 `./stop.sh`；反之亦然
2. **首次启动会自动建表/灌种子**——仅当库为空时才灌默认分类，现有数据不会被覆盖
3. macOS 升级或 Docker Desktop 重启后容器会自动拉起（`restart: unless-stopped`），等效"开机自启"
4. 若换机器用 Docker：把 `diary.db` 拷到新机的 `~/Library/Application Support/Diary/`，或先启动空库再用「从备份恢复」导入
