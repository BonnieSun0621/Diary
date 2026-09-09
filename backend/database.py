"""SQLite 连接与 Schema 管理。数据库路径可用环境变量 DIARY_DB 覆盖（测试用）。"""
import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# 数据目录：开发态在项目 data/；打包后在 ~/Library/Application Support/Diary（各用户隔离）
def _default_data_dir() -> Path:
    app_support = Path.home() / "Library" / "Application Support" / "Diary"
    try:
        app_support.mkdir(parents=True, exist_ok=True)
        return app_support
    except OSError:
        return BASE_DIR / "data"   # 打包/权限异常兜底

DATA_DIR = Path(os.environ.get("DIARY_DATA_DIR", str(_default_data_dir())))

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  level INTEGER NOT NULL,               -- 1 领域 / 2 活动类型 / 3 具体对象
  color TEXT,                           -- 大类莫兰迪色，子级继承
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                   -- YYYY-MM-DD，跨午夜归属开始日
  category_id INTEGER NOT NULL REFERENCES categories(id),
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  start_time TEXT,                      -- 选填 HH:MM
  end_time TEXT,                        -- 选填 HH:MM
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS day_pages (
  date TEXT PRIMARY KEY,
  text TEXT,
  mood_json TEXT,      -- 日内心情转变序列 JSON: [{"v":"😊","t":"14:00"},...]，t 可选，≤5 项
  weather_json TEXT    -- 日内天气转变序列 JSON，同上
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_cat ON entries(category_id);
"""


def db_path() -> Path:
    return Path(os.environ.get("DIARY_DB", str(DATA_DIR / "diary.db")))


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False：FastAPI 线程池下每请求独立连接，对象不跨线程共享
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def reset_file() -> None:
    """删除数据库文件（测试夹具使用）。"""
    p = db_path()
    if p.exists():
        p.unlink()
