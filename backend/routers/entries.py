"""每日页与活动记录：按任意日期读写（今日只是 date=today 的特例）。"""
import json


def hhmm2min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)

from fastapi import APIRouter, Depends, HTTPException

from ..database import connect
from ..helpers import (
    DayPageIn, EntryIn, EntryPatch, cat_path, check_date, check_time, check_states,
    load_cats,
)

router = APIRouter(prefix="/api", tags=["entries"])


def dep_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def entry_out(cats, row):
    path = cat_path(cats, row["category_id"])
    names = [p["name"] for p in path]
    return {
        **dict(row),
        "path": names,
        "root_icon": path[0]["icon"] or "",  # v3.3：只有大类图标
        "color": path[0]["color"],
    }


@router.get("/days/{date}")
def get_day(date: str, conn=Depends(dep_db)):
    check_date(date)
    page = conn.execute("SELECT * FROM day_pages WHERE date=?", (date,)).fetchone()
    rows = conn.execute(
        "SELECT * FROM entries WHERE date=? ORDER BY COALESCE(start_time,'99:99'), id",
        (date,),
    ).fetchall()
    cats = load_cats(conn)
    if page:
        day_page = {
            "date": date, "text": page["text"],
            "mood": json.loads(page["mood_json"]) if page["mood_json"] else [],
            "weather": json.loads(page["weather_json"]) if page["weather_json"] else [],
        }
    else:
        day_page = {"date": date, "text": None, "mood": [], "weather": []}
    # v3.5：时长改为"区间并集"——重叠活动的重合部分只计一次；无起止时间的记录按时长单独累加
    intervals = sorted(
        (hhmm2min(r["start_time"]), hhmm2min(r["end_time"]))
        for r in rows if r["start_time"] and r["end_time"]
    )
    merged, cur = 0, None
    for a, b in intervals:
        b = b if b > a else b + 1440          # 跨午夜段
        if cur is None:
            cur = [a, b]
        elif a <= cur[1]:                      # 重合/相邻：并入
            cur[1] = max(cur[1], b)
        else:
            merged += cur[1] - cur[0]
            cur = [a, b]
    if cur:
        merged += cur[1] - cur[0]
    un_timed = sum(r["duration_min"] for r in rows if not (r["start_time"] and r["end_time"]))
    return {
        "date": date,
        "day_page": day_page,
        "merged_total_min": merged + un_timed,   # 去重后的实际投入时长
        "sum_total_min": sum(r["duration_min"] for r in rows),  # 旧口径（累加）留作参考
        "entries": [entry_out(cats, r) for r in rows],
    }


@router.put("/days/{date}")
def put_day_page(date: str, body: DayPageIn, conn=Depends(dep_db)):
    check_date(date)
    mood = check_states(body.mood)
    weather = check_states(body.weather)
    conn.execute(
        """INSERT INTO day_pages(date,text,mood_json,weather_json) VALUES (?,?,?,?)
           ON CONFLICT(date) DO UPDATE SET text=excluded.text,
             mood_json=excluded.mood_json, weather_json=excluded.weather_json""",
        (date, body.text, json.dumps(mood or [], ensure_ascii=False),
         json.dumps(weather or [], ensure_ascii=False)),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM day_pages WHERE date=?", (date,)).fetchone()
    return {"date": date, "text": row["text"],
            "mood": json.loads(row["mood_json"]), "weather": json.loads(row["weather_json"])}


@router.post("/entries")
def create_entry(body: EntryIn, conn=Depends(dep_db)):
    check_date(body.date)
    check_time(body.start_time)
    check_time(body.end_time)
    if body.new_tag_name:  # 随用随建：在二级节点下注册新三级标签
        if body.category_id is not None:
            raise HTTPException(400, "category_id 与 new_tag_name 二选一")
        parent = conn.execute("SELECT * FROM categories WHERE id=?", (body.parent_id,)).fetchone()
        if parent is None or parent["level"] != 2:
            raise HTTPException(400, "新标签必须挂在二级分类下（parent_id）")
        name = body.new_tag_name.strip()
        if not name:
            raise HTTPException(400, "标签名不能为空")
        dup = conn.execute(
            "SELECT id FROM categories WHERE parent_id=? AND name=?", (parent["id"], name)
        ).fetchone()
        cid = dup["id"] if dup else conn.execute(
            """INSERT INTO categories(name,parent_id,level,color,sort_order)
               VALUES (?,?,3,?,(SELECT COALESCE(MAX(sort_order)+1,0) FROM categories WHERE parent_id=?))""",
            (name, parent["id"], parent["color"], parent["id"]),
        ).lastrowid
    else:
        cid = body.category_id
        if cid is None:
            raise HTTPException(400, "需要 category_id 或 new_tag_name")
        node = conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone()
        if node is None:
            raise HTTPException(404, "分类不存在")
        # 需求 v3.2：记录可挂在 1/2/3 任一级（如"睡眠"只选到一级即可保存）
    cur = conn.execute(
        "INSERT INTO entries(date,category_id,duration_min,start_time,end_time,note) VALUES (?,?,?,?,?,?)",
        (body.date, cid, body.duration_min, body.start_time, body.end_time, body.note),
    )
    conn.commit()
    cats = load_cats(conn)
    row = conn.execute("SELECT * FROM entries WHERE id=?", (cur.lastrowid,)).fetchone()
    return entry_out(cats, row)


@router.patch("/entries/{eid}")
def update_entry(eid: int, body: EntryPatch, conn=Depends(dep_db)):
    row = conn.execute("SELECT * FROM entries WHERE id=?", (eid,)).fetchone()
    if row is None:
        raise HTTPException(404, "记录不存在")
    fields = body.model_dump(exclude_unset=True)
    if "date" in fields:
        fields["date"] = check_date(fields["date"])
    for k in ("start_time", "end_time"):
        if k in fields:
            check_time(fields[k])
    if "category_id" in fields:
        node = conn.execute("SELECT * FROM categories WHERE id=?", (fields["category_id"],)).fetchone()
        if node is None:
            raise HTTPException(404, "分类不存在")  # v3.2：编辑同样允许任意层级
    if not fields:
        raise HTTPException(400, "无可更新字段")
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(
        f"UPDATE entries SET {sets}, updated_at=datetime('now') WHERE id=?",
        (*fields.values(), eid),
    )
    conn.commit()
    cats = load_cats(conn)
    row = conn.execute("SELECT * FROM entries WHERE id=?", (eid,)).fetchone()
    return entry_out(cats, row)


@router.delete("/entries/{eid}")
def delete_entry(eid: int, conn=Depends(dep_db)):
    if not conn.execute("SELECT 1 FROM entries WHERE id=?", (eid,)).fetchone():
        raise HTTPException(404, "记录不存在")
    conn.execute("DELETE FROM entries WHERE id=?", (eid,))
    conn.commit()
    return {"ok": True}
