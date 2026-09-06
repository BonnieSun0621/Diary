"""统计聚合 API：日历概要 / 旭日图 / 堆叠趋势 / 热力图。"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import connect
from ..helpers import check_date, load_cats

router = APIRouter(prefix="/api/stats", tags=["stats"])


def dep_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _hex_alpha(color, alpha):
    if not color:
        return None
    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
    return f"rgba({r},{g},{b},{alpha})"


def _range(start: str, end: str):
    check_date(start)
    check_date(end)
    if start > end:
        raise HTTPException(400, "start 不能晚于 end")
    return start, end


def _sum_by_cat(conn, start, end):
    rows = conn.execute(
        "SELECT category_id, SUM(duration_min) total FROM entries WHERE date BETWEEN ? AND ? GROUP BY category_id",
        (start, end),
    ).fetchall()
    return {r["category_id"]: r["total"] for r in rows}


@router.get("/sunburst")
def sunburst(start: str = Query(...), end: str = Query(...), conn=Depends(dep_db)):
    """三级嵌套旭日数据：领域>活动类型>标签，含各节点时长与颜色。"""
    _range(start, end)
    sums = _sum_by_cat(conn, start, end)
    cats = load_cats(conn)
    roots = {}
    for cid, total in sums.items():
        chain = [cats[cid]]
        p = cats[cid]["parent_id"]
        while p is not None:
            chain.append(cats[p])
            p = cats[p]["parent_id"]
        chain.reverse()
        # 逐级累加：每个祖先节点的时间 = 其子树总和
        level_alphas = {1: 1.0, 2: 0.82, 3: 0.62}
        acc = None
        for depth, node in enumerate(chain, start=1):
            if node["id"] not in roots:
                roots[node["id"]] = {
                    "id": node["id"], "name": node["name"], "icon": node["icon"],
                    "value": 0, "children": {}, "parent": acc,
                    "itemStyle": {"color": _hex_alpha(node["color"], level_alphas[depth])},
                }
                if acc is not None:
                    roots[acc]["children"][node["id"]] = roots[node["id"]]
            roots[node["id"]]["value"] += total
            acc = node["id"]

    def out(node):
        d = {k: v for k, v in node.items() if k not in ("children", "parent")}
        kids = [out(c) for c in node["children"].values()]
        if kids:
            d["children"] = kids
        return d

    top = [out(n) for n in roots.values() if n["parent"] is None]
    return {"start": start, "end": end, "data": top}


def _bucket_key(d: str, granularity: str) -> str:
    day = datetime.strptime(d, "%Y-%m-%d").date()
    if granularity == "day":
        return d
    if granularity == "week":
        return (day - timedelta(days=day.weekday())).isoformat()  # 周一为桶标签
    if granularity == "month":
        return d[:7]
    return d[:4]


@router.get("/trend")
def trend(start: str = Query(...), end: str = Query(...),
          granularity: str = Query("day", pattern="^(day|week|month|year)$"),
          conn=Depends(dep_db)):
    """按大类分色的堆叠柱数据。"""
    _range(start, end)
    cats = load_cats(conn)
    rows = conn.execute(
        "SELECT date, category_id, SUM(duration_min) total FROM entries WHERE date BETWEEN ? AND ? GROUP BY date, category_id",
        (start, end),
    ).fetchall()
    buckets, root_names = {}, {}
    for r in rows:
        key = _bucket_key(r["date"], granularity)
        root = _root(cats, r["category_id"])
        buckets.setdefault(key, {})
        buckets[key][root["id"]] = buckets[key].get(root["id"], 0) + r["total"]
        root_names[root["id"]] = (root["name"], root["color"])
    labels = sorted(buckets)
    series = [
        {"name": root_names[cid][0], "color": root_names[cid][1],
         "data": [buckets.get(b, {}).get(cid, 0) for b in labels]}
        for cid in sorted(root_names, key=lambda c: -sum(v.get(c, 0) for v in buckets.values()))
    ]
    return {"labels": labels, "series": series}


def _root(cats, cid):
    node = cats[cid]
    while node["parent_id"] is not None:
        node = cats[node["parent_id"]]
    return node


@router.get("/heatmap")
def heatmap(year: int = Query(..., ge=2000, le=2100), conn=Depends(dep_db)):
    """日历热力图：每天记录总时长（分钟）。"""
    rows = conn.execute(
        "SELECT date, SUM(duration_min) total FROM entries WHERE substr(date,1,4)=? GROUP BY date",
        (str(year),),
    ).fetchall()
    return {"year": year, "days": [{"date": r["date"], "total_min": r["total"]} for r in rows]}


@router.get("/calendar")
def calendar(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), conn=Depends(dep_db)):
    """月视图概要：每天条数、总时长、涉及大类颜色。"""
    rows = conn.execute(
        """SELECT e.date, COUNT(*) count, SUM(e.duration_min) total_min,
                  GROUP_CONCAT(DISTINCT r.id) root_ids
           FROM entries e
           JOIN categories c ON e.category_id=c.id
           JOIN categories p ON c.parent_id=p.id
           JOIN categories r ON p.parent_id=r.id
           WHERE e.date LIKE ? || '%'
           GROUP BY e.date""",
        (month,),
    ).fetchall()
    cats = load_cats(conn)
    out = []
    for r in rows:
        colors = [cats[int(i)]["color"] for i in r["root_ids"].split(",")]
        out.append({"date": r["date"], "count": r["count"],
                    "total_min": r["total_min"], "colors": colors})
    return {"month": month, "days": out}
