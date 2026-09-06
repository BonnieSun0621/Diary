"""备份与恢复：一键导出/导入单个 JSON。"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..database import connect

router = APIRouter(prefix="/api", tags=["backup"])

TABLES = {
    "categories": "SELECT * FROM categories",
    "entries": "SELECT * FROM entries",
    "day_pages": "SELECT * FROM day_pages",
}


def dep_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@router.get("/backup")
def backup(conn=Depends(dep_db)):
    payload = {"app": "diary", "version": 1, "exported_at": datetime.now().isoformat()}
    for name, sql in TABLES.items():
        payload[name] = [dict(r) for r in conn.execute(sql).fetchall()]
    import json
    body = json.dumps(payload, ensure_ascii=False, indent=1)
    fname = f"diary-backup-{datetime.now():%Y%m%d-%H%M}.json"
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/restore")
def restore(payload: dict, conn=Depends(dep_db)):
    if payload.get("app") != "diary" or not isinstance(payload.get("categories"), list):
        raise HTTPException(400, "不是有效的备份文件")
    try:
        conn.execute("BEGIN")
        for table in reversed(list(TABLES)):
            conn.execute(f"DELETE FROM {table}")
        cols = {t: [d[1] for d in conn.execute(f"PRAGMA table_info({t})")] for t in TABLES}
        for table, sql in TABLES.items():
            for row in payload.get(table, []):
                data = {k: row.get(k) for k in cols[table] if k in row}
                if not data:
                    continue
                keys = ", ".join(data)
                marks = ", ".join("?" * len(data))
                conn.execute(f"INSERT INTO {table}({keys}) VALUES ({marks})", list(data.values()))
        conn.execute("COMMIT")
    except Exception as exc:  # 恢复失败必须整体回滚，避免数据半损
        conn.execute("ROLLBACK")
        raise HTTPException(400, f"恢复失败已回滚：{exc}")
    counts = {t: conn.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"] for t in TABLES}
    return {"ok": True, "counts": counts}
