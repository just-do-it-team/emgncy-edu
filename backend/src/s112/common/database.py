from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from s112.common.config import Settings


class Database:
    def __init__(
        self,
        write_url: str,
        read_url: str | None = None,
        *,
        write_engine: AsyncEngine | None = None,
        read_engine: AsyncEngine | None = None,
    ) -> None:
        self.write_engine = write_engine or create_async_engine(
            write_url,
            pool_pre_ping=True,
        )
        if read_engine is not None:
            self.read_engine = read_engine
            self._owns_read_engine = read_engine is not self.write_engine
        elif read_url and read_url != write_url:
            self.read_engine = create_async_engine(read_url, pool_pre_ping=True)
            self._owns_read_engine = True
        else:
            self.read_engine = self.write_engine
            self._owns_read_engine = False

        self.write_session_factory = async_sessionmaker(
            self.write_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        self.read_session_factory = async_sessionmaker(
            self.read_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> "Database":
        return cls(settings.database_url, settings.read_database_url)

    async def write_session(self) -> AsyncIterator[AsyncSession]:
        async with self.write_session_factory() as session:
            yield session

    async def read_session(self) -> AsyncIterator[AsyncSession]:
        async with self.read_session_factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.write_engine.dispose()
        if self._owns_read_engine:
            await self.read_engine.dispose()

