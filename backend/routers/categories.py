"""分类树：查询 / 增删改 / 同级合并 / 最近使用的三级标签。"""
from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import connect
from ..helpers import CategoryIn, CategoryPatch, MergeIn, load_cats
from ..seed import EXTRA_PALETTE

router = APIRouter(prefix="/api/categories", tags=["categories"])


def dep_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def build_tree(conn):
    rows = conn.execute(
        "SELECT * FROM categories ORDER BY level, sort_order, id"
    ).fetchall()
    nodes = {r["id"]: {**dict(r), "children": []} for r in rows}
    roots = []
    for r in rows:
        node = nodes[r["id"]]
        if r["parent_id"] is None:
            roots.append(node)
        else:
            nodes[r["parent_id"]]["children"].append(node)
    return roots


@router.get("")
def get_categories(conn=Depends(dep_db)):
    return build_tree(conn)


@router.get("/recent")
def recent_tags(limit: int = Query(default=12, ge=1, le=30), conn=Depends(dep_db)):
    """近 60 天用过的三级标签，按最近使用排序（记录页快捷选择）。"""
    rows = conn.execute(
        """SELECT c.id, c.name, c.icon, c.color, p.name AS parent_name, r.name AS root_name,
                  MAX(e.date) AS last_used
           FROM entries e JOIN categories c ON e.category_id = c.id
           JOIN categories p ON c.parent_id = p.id
           JOIN categories r ON p.parent_id = r.id
           WHERE c.level = 3 AND e.date >= date('now', '-60 day')
           GROUP BY c.id ORDER BY last_used DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def create_category(body: CategoryIn, conn=Depends(dep_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "名称不能为空")
    if body.parent_id is None:
        level, parent = 1, None
        color = body.color
        if not color:  # 用户新建的一级领域：按数量顺延取备用色
            n = conn.execute("SELECT COUNT(*) c FROM categories WHERE level=1").fetchone()["c"]
            color = EXTRA_PALETTE[n % len(EXTRA_PALETTE)]
    else:
        parent = conn.execute(
            "SELECT * FROM categories WHERE id=?", (body.parent_id,)
        ).fetchone()
        if parent is None:
            raise HTTPException(404, "父级分类不存在")
        if parent["level"] >= 3:
            raise HTTPException(400, "分类最深三级")
        level = parent["level"] + 1
        color = parent["color"]  # 子级继承大类色
    dup = conn.execute(
        "SELECT id FROM categories WHERE name=? AND parent_id IS ?",
        (name, body.parent_id),
    ).fetchone()
    if dup:
        raise HTTPException(409, "同级已存在同名分类")
    order = conn.execute(
        "SELECT COALESCE(MAX(sort_order)+1,0) o FROM categories WHERE parent_id IS ?",
        (body.parent_id,),
    ).fetchone()["o"]
    cur = conn.execute(
        "INSERT INTO categories(name,parent_id,level,color,icon,sort_order) VALUES (?,?,?,?,?,?)",
        (name, body.parent_id, level, color, body.icon, order),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM categories WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


@router.patch("/{cid}")
def rename_category(cid: int, body: CategoryPatch, conn=Depends(dep_db)):
    node = conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone()
    if node is None:
        raise HTTPException(404, "分类不存在")
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields:
        fields["name"] = fields["name"].strip()
    if not fields:
        raise HTTPException(400, "无可更新字段")
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE categories SET {sets} WHERE id=?", (*fields.values(), cid))
    conn.commit()
    return dict(conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone())


@router.delete("/{cid}")
def delete_category(cid: int, conn=Depends(dep_db)):
    node = conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone()
    if node is None:
        raise HTTPException(404, "分类不存在")
    if conn.execute("SELECT 1 FROM categories WHERE parent_id=?", (cid,)).fetchone():
        raise HTTPException(409, "仍有子分类，请先删除或移动子级")
    used = conn.execute(
        "SELECT COUNT(*) c FROM entries WHERE category_id=?", (cid,)
    ).fetchone()["c"]
    if used:
        raise HTTPException(409, f"该分类下还有 {used} 条记录，请先合并到其他分类")
    conn.execute("DELETE FROM categories WHERE id=?", (cid,))
    conn.commit()
    return {"ok": True}


@router.post("/{cid}/merge")
def merge_category(cid: int, body: MergeIn, conn=Depends(dep_db)):
    """把 cid 合并进 target（同级）：子分类与记录迁移后删除 cid。"""
    src = conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone()
    dst = conn.execute("SELECT * FROM categories WHERE id=?", (body.target_id,)).fetchone()
    if src is None or dst is None:
        raise HTTPException(404, "分类不存在")
    if cid == body.target_id:
        raise HTTPException(400, "不能合并到自己")
    if src["level"] != dst["level"]:
        raise HTTPException(400, "只能合并同级分类")
    # 二级合并时，若两侧存在同名三级，先自动并入同名节点
    dst_children = {r["name"]: r["id"] for r in conn.execute(
        "SELECT id,name FROM categories WHERE parent_id=?", (body.target_id,))}
    for child in conn.execute("SELECT * FROM categories WHERE parent_id=?", (cid,)).fetchall():
        target_child = dst_children.get(child["name"])
        if target_child:
            conn.execute("UPDATE categories SET parent_id=? WHERE parent_id=?", (target_child, child["id"]))
            conn.execute("UPDATE entries SET category_id=? WHERE category_id=?", (target_child, child["id"]))
            conn.execute("DELETE FROM categories WHERE id=?", (child["id"],))
        else:
            conn.execute("UPDATE categories SET parent_id=? WHERE id=?", (body.target_id, child["id"]))
    conn.execute("UPDATE entries SET category_id=? WHERE category_id=?", (body.target_id, cid))
    conn.execute("DELETE FROM categories WHERE id=?", (cid,))
    conn.commit()
    return {"ok": True}
