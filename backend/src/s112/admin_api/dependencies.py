from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_admin_write_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.database.write_session_factory() as session:
        yield session


async def get_admin_read_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.database.read_session_factory() as session:
        yield session
