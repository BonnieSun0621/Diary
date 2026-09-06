"""共享工具：校验、分类树辅助、请求模型。"""
import re
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def check_date(s: str) -> str:
    if not DATE_RE.match(s):
        raise HTTPException(400, f"日期格式应为 YYYY-MM-DD：{s}")
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"非法日期：{s}")
    return s


def check_time(s):
    if s is None:
        return None
    if not TIME_RE.match(s):
        raise HTTPException(400, f"时间格式应为 HH:MM：{s}")
    return s


def load_cats(conn) -> dict:
    """id -> 分类行(dict)。"""
    return {r["id"]: dict(r) for r in conn.execute("SELECT * FROM categories")}


def cat_path(cats: dict, cid: int):
    """返回 [一级, 二级, 三级] 节点列表；不存在则 404。"""
    chain = []
    while cid is not None:
        node = cats.get(cid)
        if node is None:
            raise HTTPException(404, "分类不存在")
        chain.append(node)
        cid = node["parent_id"]
    return list(reversed(chain))


def root_color(cats: dict, cid: str) -> Optional[str]:
    return cat_path(cats, cid)[0]["color"]


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    parent_id: Optional[int] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class CategoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=30)
    icon: Optional[str] = None
    color: Optional[str] = None


class MergeIn(BaseModel):
    target_id: int


def check_states(seq):
    """日内状态转变序列：最多 5 项，每项 {v: 非空字符串, t: 可选 HH:MM}。"""
    if seq is None:
        return None
    if not isinstance(seq, list):
        raise HTTPException(400, "状态必须是列表")
    if len(seq) > 5:
        raise HTTPException(400, "一天内最多 5 次转变")
    for item in seq:
        if not isinstance(item, dict) or not (item.get("v") or "").strip():
            raise HTTPException(400, "状态项缺少值 v")
        if item.get("t") is not None:
            check_time(item["t"])
    return seq


class DayPageIn(BaseModel):
    text: Optional[str] = Field(default=None, max_length=5000)
    mood: Optional[list] = None      # 转变序列，见 check_states
    weather: Optional[list] = None


class EntryIn(BaseModel):
    date: str
    duration_min: int = Field(gt=0, le=1440)
    category_id: Optional[int] = None
    new_tag_name: Optional[str] = Field(default=None, max_length=30)  # 随用随建三级标签
    parent_id: Optional[int] = None  # 新标签挂载的二级节点
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)


class EntryPatch(BaseModel):
    date: Optional[str] = None
    duration_min: Optional[int] = Field(default=None, gt=0, le=1440)
    category_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    note: Optional[str] = None
