"""数据层与 API 验证（需求文档 §3、§4-B、统计口径 5 条）。"""


def find_node(tree, name):
    for n in tree:
        if n["name"] == name:
            return n
    return None


def sub_tag(client, l1, l2, name):
    tree = client.get("/api/categories").json()
    g = find_node(tree, l1)["children"]
    parent = find_node(g, l2)
    r = client.post("/api/categories", json={"name": name, "parent_id": parent["id"]})
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- 模板与分类管理 ----------

def test_seed_template(client):
    tree = client.get("/api/categories").json()
    names = {n["name"] for n in tree}
    assert {"工作", "娱乐", "出行", "食物"} <= names
    fun = find_node(tree, "娱乐")
    assert fun["level"] == 1 and fun["color"].startswith("#")
    assert find_node(fun["children"], "游戏")["level"] == 2
    assert all(c["level"] == 2 for c in fun["children"])  # 模板只建到二级


def test_category_crud_and_rename(client):
    tid = sub_tag(client, "娱乐", "游戏", "艾尔登法环")
    r = client.patch(f"/api/categories/{tid}", json={"name": "老头环"})
    assert r.json()["name"] == "老头环"
    assert client.delete(f"/api/categories/{tid}").status_code == 200


def test_delete_blocked_by_entries(client):
    """删除有记录的标签现在走级联删除（连带记录），不再 409。"""
    tid = sub_tag(client, "娱乐", "游戏", "塞尔达")
    client.post("/api/entries", json={"date": "2026-09-01", "category_id": tid, "duration_min": 60})
    r = client.delete(f"/api/categories/{tid}")
    assert r.status_code == 200 and r.json()["deleted"] == {"categories": 1, "entries": 1}
    assert client.get("/api/days/2026-09-01").json()["entries"] == []


def test_merge_same_level(client):
    a = sub_tag(client, "娱乐", "游戏", "原神")
    b = sub_tag(client, "娱乐", "游戏", "崩铁")
    client.post("/api/entries", json={"date": "2026-09-01", "category_id": b, "duration_min": 45})
    assert client.post(f"/api/categories/{b}/merge", json={"target_id": a}).status_code == 200
    day = client.get("/api/days/2026-09-01").json()["entries"]
    assert day[0]["path"][-1] == "原神"


# ---------- 任意日期读写（历史补记/查看） ----------

def test_entry_on_past_date(client):
    tid = sub_tag(client, "食物", "正餐", "拉面店A")
    r = client.post("/api/entries", json={
        "date": "2026-08-20", "category_id": tid, "duration_min": 45,
        "start_time": "12:30", "end_time": "13:15", "note": "加蛋",
    })
    assert r.status_code == 200
    day = client.get("/api/days/2026-08-20").json()
    e = day["entries"][0]
    assert e["path"] == ["食物", "正餐", "拉面店A"]
    assert e["duration_min"] == 45 and e["note"] == "加蛋"
    # 另一天不受影响
    assert client.get("/api/days/2026-08-21").json()["entries"] == []


def test_new_tag_on_the_fly(client):
    tree = client.get("/api/categories").json()
    parent = find_node(find_node(tree, "娱乐")["children"], "游戏")
    r = client.post("/api/entries", json={
        "date": "2026-09-05", "new_tag_name": "新游戏X", "parent_id": parent["id"], "duration_min": 30,
    })
    assert r.json()["path"] == ["娱乐", "游戏", "新游戏X"]
    # 同名再建不产生重复标签
    r2 = client.post("/api/entries", json={
        "date": "2026-09-05", "new_tag_name": "新游戏X", "parent_id": parent["id"], "duration_min": 20,
    })
    assert r2.json()["path"][-1] == "新游戏X"
    parent_after = find_node(client.get("/api/categories").json(), "娱乐")
    parent_after = find_node(parent_after["children"], "游戏")
    tag = find_node(parent_after["children"], "新游戏X")
    assert tag["id"] == r.json()["category_id"] == r2.json()["category_id"]


def test_multiple_same_tag_sum_and_edit(client):
    tid = sub_tag(client, "娱乐", "游戏", "双记录")
    e1 = client.post("/api/entries", json={"date": "2026-09-06", "category_id": tid, "duration_min": 60}).json()
    client.post("/api/entries", json={"date": "2026-09-06", "category_id": tid, "duration_min": 90})
    day = client.get("/api/days/2026-09-06").json()
    assert len(day["entries"]) == 2  # 口径④：同日同标签允许多条
    assert client.patch(f"/api/entries/{e1['id']}", json={"note": "改备注"}).json()["note"] == "改备注"
    assert client.delete(f"/api/entries/{e1['id']}").status_code == 200
    assert len(client.get("/api/days/2026-09-06").json()["entries"]) == 1


def test_cross_midnight_belongs_to_start_day(client):
    tid = sub_tag(client, "娱乐", "影音", "球赛")
    client.post("/api/entries", json={
        "date": "2026-09-05", "category_id": tid, "duration_min": 120,
        "start_time": "23:00", "end_time": "01:00",
    })  # 口径③：跨午夜归开始日
    assert len(client.get("/api/days/2026-09-05").json()["entries"]) == 1
    assert client.get("/api/days/2026-09-06").json()["entries"] == []


def test_validation_errors(client):
    tid = sub_tag(client, "工作", "项目工作", "项目M")
    assert client.post("/api/entries", json={"date": "2026-9-1", "category_id": tid, "duration_min": 10}).status_code == 400
    assert client.post("/api/entries", json={"date": "2026-09-01", "category_id": tid, "duration_min": 0}).status_code == 422
    tree = client.get("/api/categories").json()
    l2 = find_node(find_node(tree, "工作")["children"], "项目工作")
    # v3.2：允许挂任意层级（l2 直挂合法）
    assert client.post("/api/entries", json={"date": "2026-09-01", "category_id": l2["id"], "duration_min": 10}).status_code == 200


# ---------- 每日页（日内状态转变序列，需求 v3-R2） ----------

def test_day_page_states_sequence(client):
    body = {
        "text": "先晴后雨",
        "mood": [{"v": "🙂"}, {"v": "😫", "t": "15:00"}],
        "weather": [{"v": "☀️", "t": "00:00"}, {"v": "🌧", "t": "14:00"}, {"v": "🌤", "t": "18:30"}],
    }
    assert client.put("/api/days/2026-09-06", json=body).status_code == 200
    page = client.get("/api/days/2026-09-06").json()["day_page"]
    assert page["weather"] == body["weather"]  # 有序序列原样返回
    assert page["mood"][1] == {"v": "😫", "t": "15:00"}
    # 空数组 = 清空
    client.put("/api/days/2026-09-06", json={**body, "mood": [], "weather": []})
    page = client.get("/api/days/2026-09-06").json()["day_page"]
    assert page["mood"] == [] and page["weather"] == []


def test_day_page_state_validation(client):
    u = "/api/days/2026-09-06"
    six = [{"v": "☀️"}] * 6
    assert client.put(u, json={"weather": six}).status_code == 400   # 最多 5 项
    assert client.put(u, json={"weather": [{"v": ""}]}).status_code == 400  # 值不能空
    assert client.put(u, json={"weather": [{"v": "☀️", "t": "3pm"}]}).status_code == 400  # 时刻格式
    assert client.put(u, json={"weather": [{"t": "10:00"}]}).status_code == 400  # 缺 v
    assert client.put(u, json={"weather": [{"v": "☀️"}] * 5}).status_code == 200  # 5 项合法


# ---------- 级联逐级新建（需求 v3-R1，后端能力） ----------

def test_cascade_create_levels(client):
    # 一级：直接 POST 无 parent
    l1 = client.post("/api/categories", json={"name": "副业"}).json()
    assert l1["level"] == 1 and l1["parent_id"] is None
    # 二级：挂在刚建的一级下，颜色继承
    l2 = client.post("/api/categories", json={"name": "接单", "parent_id": l1["id"]}).json()
    assert l2["level"] == 2 and l2["color"] == l1["color"]
    # 三级：记录接口随用随建（同名复用）
    e1 = client.post("/api/entries", json={"date": "2026-09-06", "new_tag_name": "网站X",
                                           "parent_id": l2["id"], "duration_min": 30}).json()
    e2 = client.post("/api/entries", json={"date": "2026-09-06", "new_tag_name": "网站X",
                                           "parent_id": l2["id"], "duration_min": 10}).json()
    assert e1["path"] == ["副业", "接单", "网站X"] == e2["path"]
    assert e1["category_id"] == e2["category_id"]  # 同名不重建
    # 同级同名拒绝（前端据此转为"选中已有"）；不同父级下允许同名
    assert client.post("/api/categories", json={"name": "副业"}).status_code == 409
    assert client.post("/api/categories", json={"name": "接单", "parent_id": 1}).json()["level"] == 2


# ---------- 统计 ----------

def _fill(client):
    a = sub_tag(client, "娱乐", "游戏", "A游戏")
    b = sub_tag(client, "工作", "项目工作", "B项目")
    data = [
        ("2026-09-01", a, 120), ("2026-09-01", b, 300),
        ("2026-09-02", a, 60),
        ("2026-08-20", b, 60),
    ]
    for d, c, m in data:
        client.post("/api/entries", json={"date": d, "category_id": c, "duration_min": m})


def test_sunburst_three_levels(client):
    _fill(client)
    r = client.get("/api/stats/sunburst", params={"start": "2026-09-01", "end": "2026-09-02"}).json()
    by_name = {n["name"]: n for n in r["data"]}
    assert by_name["娱乐"]["value"] == 180  # 120+60
    assert by_name["工作"]["value"] == 300
    l2 = by_name["娱乐"]["children"][0]
    assert l2["name"] == "游戏" and l2["value"] == 180
    assert l2["children"][0]["name"] == "A游戏" and l2["children"][0]["value"] == 180


def test_trend_and_calendar_and_heatmap(client):
    _fill(client)
    t = client.get("/api/stats/trend", params={"start": "2026-09-01", "end": "2026-09-02", "granularity": "day"}).json()
    assert t["labels"] == ["2026-09-01", "2026-09-02"]
    s = {x["name"]: x["data"] for x in t["series"]}
    assert s["娱乐"] == [120, 60] and s["工作"] == [300, 0]
    w = client.get("/api/stats/trend", params={"start": "2026-08-01", "end": "2026-09-30", "granularity": "week"}).json()
    assert w["labels"][0] == "2026-08-17"  # 8/20(周四)所在周的周一
    c = client.get("/api/stats/calendar", params={"month": "2026-09"}).json()
    assert {d["date"]: d["count"] for d in c["days"]} == {"2026-09-01": 2, "2026-09-02": 1}
    h = client.get("/api/stats/heatmap", params={"year": 2026}).json()
    totals = {d["date"]: d["total_min"] for d in h["days"]}
    assert totals["2026-09-01"] == 420 and totals["2026-08-20"] == 60


# ---------- 备份 / 恢复 ----------

def test_backup_restore(client):
    _fill(client)
    payload = client.get("/api/backup").json()
    assert payload["app"] == "diary" and len(payload["entries"]) == 4
    client.post("/api/entries", json={"date": "2026-09-03", "category_id": payload["entries"][0]["category_id"], "duration_min": 5})
    r = client.post("/api/restore", json=payload)
    assert r.status_code == 200 and r.json()["counts"]["entries"] == 4
    assert client.get("/api/days/2026-09-03").json()["entries"] == []  # 恢复到备份时点


def test_new_root_gets_palette_color(client):
    # 用户新建的一级领域不再是无色（颜色链：L1→L2→L3→entry）
    l1 = client.post("/api/categories", json={"name": "自由职业"}).json()
    assert l1["color"] and l1["color"].startswith("#")
    l2 = client.post("/api/categories", json={"name": "接单", "parent_id": l1["id"]}).json()
    l3 = client.post("/api/categories", json={"name": "网站X", "parent_id": l2["id"]}).json()
    e = client.post("/api/entries", json={"date": "2026-09-06", "category_id": l3["id"], "duration_min": 50}).json()
    assert e["color"] == l1["color"] and e["path"] == ["自由职业", "接单", "网站X"]


def test_delete_subtree_with_entries(client):
    """母级删除 = 整棵子树 + 其下记录连带删除（前端已先弹确认）。"""
    l1 = client.post("/api/categories", json={"name": "测试域"}).json()
    l2 = client.post("/api/categories", json={"name": "测试型", "parent_id": l1["id"]}).json()
    l3 = client.post("/api/categories", json={"name": "测试签", "parent_id": l2["id"]}).json()
    client.post("/api/entries", json={"date": "2026-09-06", "category_id": l3["id"], "duration_min": 10})
    client.post("/api/entries", json={"date": "2026-09-05", "category_id": l3["id"], "duration_min": 20})
    size = client.get(f"/api/categories/{l1['id']}/subtree-size").json()
    assert size == {"categories": 3, "entries": 2}
    r = client.delete(f"/api/categories/{l1['id']}")
    assert r.status_code == 200 and r.json() == {"ok": True, "deleted": {"categories": 3, "entries": 2}}
    tree = client.get("/api/categories").json()
    names = {n["name"] for n in tree}
    assert not {"测试域", "测试型", "测试签"} & names
    # 记录连带删除，其他日期不受影响
    assert client.get("/api/days/2026-09-06").json()["entries"] == []
    assert client.get("/api/days/2026-09-05").json()["entries"] == []
    # 兄弟分类完好
    assert "娱乐" in names


def test_entry_on_any_level(client):
    """v3.2：记录可挂在 1/2/3 任一级（睡眠等只选一级）。"""
    tree = client.get("/api/categories").json()
    l1 = find_node(tree, "健康运动")
    l2 = find_node(l1["children"], "睡眠")
    # 一级
    e1 = client.post("/api/entries", json={"date": "2026-09-06", "category_id": l1["id"], "duration_min": 420}).json()
    assert e1["path"] == ["健康运动"]
    # 二级
    e2 = client.post("/api/entries", json={"date": "2026-09-06", "category_id": l2["id"], "duration_min": 60}).json()
    assert e2["path"] == ["健康运动", "睡眠"]
    # 编辑改到一级也允许
    r = client.patch(f"/api/entries/{e2['id']}", json={"category_id": l1["id"]})
    assert r.json()["path"] == ["健康运动"]
    # 统计与最近使用包含非三级记录
    sb = client.get("/api/stats/sunburst?start=2026-09-06&end=2026-09-06").json()
    assert {n["name"]: n["value"] for n in sb["data"]}["健康运动"] == 480
    recent = client.get("/api/categories/recent").json()
    assert any(x["id"] == l1["id"] for x in recent)
    # 日详情正常
    assert len(client.get("/api/days/2026-09-06").json()["entries"]) == 2


def test_icon_only_on_root(client):
    """v3.3 图标规则：只有一级有图标；新建一级自动配图标；二三级恒为 NULL。"""
    tree = client.get("/api/categories").json()
    for n in tree:
        assert n["icon"], f"一级 {n['name']} 应有图标"
        for c in n["children"] or []:
            assert c["icon"] is None, f"二级 {n['name']}>{c['name']} 不应有图标"
    # 用户新建一级 → 自动从图标池分配
    l1 = client.post("/api/categories", json={"name": "新领域"}).json()
    assert l1["icon"], l1
    l2 = client.post("/api/categories", json={"name": "子型", "parent_id": l1["id"]}).json()
    assert l2["icon"] is None
    # 记录输出：path 纯名称 + root_icon 只有一级图标
    l3 = client.post("/api/categories", json={"name": "子签", "parent_id": l2["id"]}).json()
    e = client.post("/api/entries", json={"date": "2026-09-06", "category_id": l3["id"], "duration_min": 30}).json()
    assert e["path"] == ["新领域", "子型", "子签"]
    assert e["root_icon"] == l1["icon"]
    assert "icon" not in e


def test_icon_editable_on_root(client):
    """v3.4：一级大类图标前端可编辑（PATCH icon）；二三级拒绝。"""
    tree = client.get("/api/categories").json()
    l1 = find_node(tree, "娱乐")
    r = client.patch(f"/api/categories/{l1['id']}", json={"icon": "🕹"})
    assert r.status_code == 200 and r.json()["icon"] == "🕹"
    # 清除图标（空串→None）
    r = client.patch(f"/api/categories/{l1['id']}", json={"icon": ""})
    assert r.json()["icon"] is None
    client.patch(f"/api/categories/{l1['id']}", json={"icon": "🎮"})  # 还原
    l2 = find_node(tree, "工作")
    l2 = find_node(l2["children"], "项目工作")
    assert client.patch(f"/api/categories/{l2['id']}", json={"icon": "🧩"}).status_code == 400


def test_merged_total_dedup(client):
    """v3.5：重叠活动并集去重——10:00-12:00(120m)+11:00-12:30(90m) 并集=150m；无时段记录另加。"""
    a = sub_tag(client, "娱乐", "游戏", "重叠A")
    b = sub_tag(client, "工作", "会议沟通", "重叠B")
    c = sub_tag(client, "学习成长", "读书", "重叠C")
    client.post("/api/entries", json={"date": "2026-09-07", "category_id": a, "duration_min": 120, "start_time": "10:00", "end_time": "12:00"})
    client.post("/api/entries", json={"date": "2026-09-07", "category_id": b, "duration_min": 90, "start_time": "11:00", "end_time": "12:30"})
    client.post("/api/entries", json={"date": "2026-09-07", "category_id": c, "duration_min": 45})
    d = client.get("/api/days/2026-09-07").json()
    assert d["sum_total_min"] == 255
    assert d["merged_total_min"] == 195
