"""初始分类模板：一级 + 二级；三级由用户在使用中生长。"""

PALETTE = [
    "#8FA6B9",  # 雾蓝 工作
    "#A3B899",  # 烟绿 娱乐
    "#C2A5B6",  # 荷紫 出行
    "#CCA88A",  # 杏棕 食物
    "#9BC4BC",  # 薄荷灰 健康运动
    "#B0A8C9",  # 灰紫 学习成长
    "#D4A5A5",  # 豆沙粉 社交
    "#B7AE9D",  # 燕麦灰 日常事务
]

# 模板未覆盖的一级领域（用户新建）按序取备用莫兰迪色
EXTRA_PALETTE = ["#C9B8A3", "#A8B5C2", "#B9A3A3", "#9FB3AE", "#C4B899", "#AFA3C2"]

# v3.7：emoji+文字 = 完整可编辑的名称（不再有独立图标字段）；二三级纯文字
# (一级名称(含emoji), [二级名称, ...])
TEMPLATE = [
    ("💼 工作", ["项目工作", "会议沟通", "文书汇报"]),
    ("🎮 娱乐", ["游戏", "影音", "阅读", "音乐", "线下娱乐"]),
    ("🚗 出行", ["通勤", "旅行", "自驾"]),
    ("🍜 食物", ["正餐", "小吃甜点", "饮品"]),
    ("💪 健康运动", ["锻炼", "睡眠", "身体护理"]),
    ("📚 学习成长", ["读书", "课程", "技能练习"]),
    ("🥂 社交", ["朋友相聚", "家人相处", "线上社交"]),
    ("🧾 日常事务", ["家务", "采购", "行政办事"]),
]


def seed_if_empty(conn):
    if conn.execute("SELECT COUNT(*) c FROM categories").fetchone()["c"] > 0:
        return
    for i, (l1, children) in enumerate(TEMPLATE):
        color = PALETTE[i % len(PALETTE)]
        cur = conn.execute(
            "INSERT INTO categories(name,parent_id,level,color,icon,sort_order) VALUES (?,NULL,1,?,NULL,?)",
            (l1, color, i),
        )
        pid = cur.lastrowid
        for j, l2 in enumerate(children):
            conn.execute(
                "INSERT INTO categories(name,parent_id,level,color,icon,sort_order) VALUES (?,?,2,?,NULL,?)",
                (l2, pid, color, j),
            )
    conn.commit()
