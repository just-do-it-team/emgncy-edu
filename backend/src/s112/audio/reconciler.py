from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from s112.audio.storage import SeaweedStorage
from s112.common.config import Settings
from s112.common.database import Database
from s112.domain.models import AudioMessage, TtsSegment


logger = logging.getLogger(__name__)


class AudioObjectReconciler:
    def __init__(
        self,
        database: Database,
        storage: SeaweedStorage,
        settings: Settings,
    ) -> None:
        self.database = database
        self.storage = storage
        self.settings = settings
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run_once(self) -> int:
        # Deletion decisions must use the primary: a lagging read replica can
        # otherwise make a live object look orphaned.
        async with self.database.write_session_factory() as session:
            known_keys = set(await session.scalars(select(AudioMessage.object_key)))
            known_keys.update(
                await session.scalars(
                    select(TtsSegment.object_key).where(TtsSegment.status == "COMPLETED")
                )
            )
        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=self.settings.audio_orphan_grace_seconds
        )
        deleted = 0
        for entry in await self.storage.list_objects(
            self.settings.seaweed_audio_prefix
        ):
            modified_at = entry.modified_at
            if modified_at.tzinfo is None:
                modified_at = modified_at.replace(tzinfo=timezone.utc)
            if entry.object_key in known_keys or modified_at > cutoff:
                continue
            if await self.storage.delete(entry.object_key):
                deleted += 1
                logger.warning("Deleted orphan audio object %s", entry.object_key)
        return deleted

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.run_once()
            except Exception:
                logger.exception("Audio object reconciliation failed")
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.settings.audio_reconcile_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass
