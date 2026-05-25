"""开发环境种子数据。

创建 admin + member 测试用户。
不要在生产环境执行。
Idempotent: 跳过已存在的用户。
"""

import asyncio
import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def main():
    if os.getenv("APP_ENV") == "production":
        print("ERROR: 禁止在生产环境执行 seed 脚本", file=sys.stderr)
        sys.exit(1)

    asyncio.run(_seed())


async def _seed():
    from sqlalchemy import select

    from app.auth.password import hash_password
    from app.db.session import async_session_factory
    from app.models.user import User

    users = [
        {"username": "admin", "display_name": "管理员", "password": "admin123", "role": "admin"},
        {"username": "zhangsan", "display_name": "张三", "password": "member123", "role": "member"},
        {"username": "lisi", "display_name": "李四", "password": "member123", "role": "member"},
    ]

    async with async_session_factory() as session:
        for u in users:
            result = await session.execute(select(User).where(User.username == u["username"]))
            if result.scalar_one_or_none() is not None:
                print(f"  [skip] {u['username']} already exists")
                continue
            session.add(User(
                username=u["username"],
                display_name=u["display_name"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
            ))
            print(f"  [created] {u['username']} ({u['role']})")
        await session.commit()

    print("Done.")
