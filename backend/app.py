"""FastAPI 应用入口：/api/* 提供数据接口，/ 提供前端静态页。"""
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from . import database
from .routers import backup, categories, entries, stats
from .seed import seed_if_empty

app = FastAPI(title="可视化日记", version="1.0")

APP_BUILD = "v3.1 (20260906)"


class NoCacheStatic(BaseHTTPMiddleware):
    """前端静态资源禁用强缓存：程序更新后普通刷新即可拿到新版本（避免 PWA/浏览器缓存旧 JS）。"""

    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        p = request.url.path
        if p == "/" or p.startswith(("/js", "/css", "/manifest", "/icon")):
            resp.headers["Cache-Control"] = "no-cache"
        return resp


app.add_middleware(NoCacheStatic)


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
