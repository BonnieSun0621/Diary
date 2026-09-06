"""FastAPI 应用入口：/api/* 提供数据接口，/ 提供前端静态页。"""
from fastapi import FastAPI

from . import database
from .routers import backup, categories, entries, stats
from .seed import seed_if_empty

app = FastAPI(title="可视化日记", version="1.0")


def ensure_db():
    conn = database.connect()
    try:
        conn.executescript(database.SCHEMA)
        seed_if_empty(conn)
    finally:
        conn.close()


ensure_db()

app.include_router(categories.router)
app.include_router(entries.router)
app.include_router(stats.router)
app.include_router(backup.router)

from fastapi.staticfiles import StaticFiles  # noqa: E402

app.mount("/", StaticFiles(directory=database.BASE_DIR / "frontend", html=True), name="frontend")
