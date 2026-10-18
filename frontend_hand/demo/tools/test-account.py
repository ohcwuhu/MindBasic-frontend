"""自检用的测试账号助手（只在开发机上跑，不参与交付）。

两件事：
  seed --phone 139xxxxxxxx   给这个账号造一次「聊到行动」的通话（带阶段与轮次），
                             打印 conversation_id —— 收束卡要靠它才有东西可整理；
  drop --phone 139xxxxxxxx   把这个账号和它名下自检产生的行删干净。
  purge --nickname 行动自检   按昵称把自检跑挂之后留下的账号一起清掉（--phone 的兜底）。

为什么要造一条通话：AI 对话是 socket 实时管线写进去的，没有 REST 接口能从外面新建，
而「收束卡」只在一次真实通话结束后才弹出来。自检要在不打电话的前提下验它，就得先有这条记录。
内容固定成评审给的那个场景（大学生面对任务压力、不知道从哪开始），四行都能对上：
  · 这次谈到的事 ← opening 阶段用户第一句
  · 你希望的变化 ← goal_setting 阶段用户那句
  · 我的一小步   ← action_planning 阶段用户那句

用法（工作目录必须是后端根目录，配置从它的 .env 读）：
  <backend>\\.venv\\Scripts\\python.exe tools\\test-account.py seed --phone 13900000009
"""

import argparse
import sys

sys.path.insert(0, r"C:\Users\26329\Desktop\斐思同行\项目主体\项目代码\MindBasic-backend")

from sqlalchemy import bindparam, text  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402

TURNS = [
    ("USER", "这周的论文堆到最后一周了，我不知道从哪开始，一想到就烦。", "opening"),
    ("ASSISTANT", "听起来不是不想做，是一下子看到太多。先从最响的那件事说起？", "opening"),
    ("USER", "最响的是开题那部分，我连要用的材料都还没整理。", "exploration"),
    ("ASSISTANT", "这种「没头绪」的时候，你以前用过什么办法让自己动起来？", "exploration"),
    ("USER", "上次是先把要用的论文列出来，列完就没那么慌了。", "exploration"),
    ("ASSISTANT", "如果这周结束的时候好一点，会是什么样子？", "goal_setting"),
    ("USER", "至少开题的框架能写出来，知道要写哪几块。", "goal_setting"),
    ("ASSISTANT", "那今晚最小的一步，你想做哪一个？", "action_planning"),
    ("USER", "今晚先把论文的三个待办列出来吧。", "action_planning"),
]

# 账号名下会被自检写到、清理时要一起删掉的表（顺序：先子后父）
OWNED_TABLES = [
    "ai_messages",
    "ai_conversations",
    "emotion_journals",
    "check_ins",
    "growth_assessment_results",
    "self_coaching_records",
    "user_badges",
    "notifications",
    "article_favorites",
    "user_wallets",
    "refresh_tokens",
    "data_exports",
    "consent_records",
    "multimodal_analysis_records",
]


def find_user(session, phone):
    return session.execute(
        text("SELECT id, nickname FROM users WHERE phone = :phone"), {"phone": phone}
    ).first()


def seed(session, phone):
    user = find_user(session, phone)
    if user is None:
        raise SystemExit("没找到这个手机号的账号：先注册再来。")
    user_id = int(user[0])

    conversation_id = session.execute(
        text(
            "INSERT INTO ai_conversations "
            "(user_id, title, status, client_session_id, message_count, turn_count, final_stage) "
            "VALUES (:user_id, :title, 'ENDED', :sid, :messages, :turns, 'action_planning')"
        ),
        {
            "user_id": user_id,
            "title": "论文堆到最后一周",
            "sid": "selftest-" + str(user_id),
            "messages": len(TURNS),
            "turns": (len(TURNS) + 1) // 2,
        },
    ).lastrowid

    for index, (role, content, stage) in enumerate(TURNS, start=1):
        session.execute(
            text(
                "INSERT INTO ai_messages "
                "(conversation_id, role, content, turn_index, stage, risk_level, should_summarize) "
                "VALUES (:cid, :role, :content, :turn, :stage, 'NONE', :summarize)"
            ),
            {
                "cid": conversation_id,
                "role": role,
                "content": content,
                "turn": (index + 1) // 2,
                "stage": stage,
                "summarize": role == "ASSISTANT" and stage == "action_planning",
            },
        )
    session.commit()
    print(conversation_id)


def drop(session, phone):
    user = find_user(session, phone)
    if user is None:
        print("没有匹配的账号（可能已经清过了）。")
        return
    user_id = int(user[0])
    removed = {}
    for table in OWNED_TABLES:
        if table == "ai_messages":
            where = "conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = :uid)"
        else:
            where = "user_id = :uid"
        result = session.execute(text("DELETE FROM %s WHERE %s" % (table, where)), {"uid": user_id})
        removed[table] = result.rowcount
    session.execute(
        text("DELETE FROM users WHERE id IN :ids").bindparams(bindparam("ids", expanding=True)),
        {"ids": [user_id]},
    )
    session.commit()
    print("已删除账号 %s（%s）" % (user_id, phone))
    print("  " + " · ".join("%s %s" % (name, count) for name, count in removed.items() if count))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["seed", "drop", "purge"])
    parser.add_argument("--phone")
    parser.add_argument("--nickname")
    args = parser.parse_args()

    session = SessionLocal()
    try:
        if args.action == "purge":
            if not args.nickname:
                raise SystemExit("purge 要带 --nickname")
            matched = session.execute(
                text("SELECT phone FROM users WHERE nickname = :nickname"), {"nickname": args.nickname}
            ).scalars().all()
            if not matched:
                print("没有匹配的账号。")
            for phone in matched:
                drop(session, phone)
            return
        if not args.phone:
            raise SystemExit("seed / drop 要带 --phone")
        if args.action == "seed":
            seed(session, args.phone)
        else:
            drop(session, args.phone)
    finally:
        session.close()


if __name__ == "__main__":
    main()
