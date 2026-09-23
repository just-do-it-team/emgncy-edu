import asyncio
import logging
import signal

from s112.common.config import get_settings
from s112.common.database import Database
from s112.dialogue.worker import DialogueWorker


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    database = Database.from_settings(settings)
    worker = DialogueWorker(database, settings)
    loop = asyncio.get_running_loop()
    for signame in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signame, worker.stop)
        except NotImplementedError:
            pass
    try:
        await worker.run()
    finally:
        await database.dispose()


if __name__ == "__main__":
    asyncio.run(async_main())
