import asyncio
import logging
import signal

from s112.common.config import get_settings
from s112.common.database import Database
from s112.template_generation.client import TemplateGenerationClient
from s112.template_generation.worker import CardTemplateGenerationWorker


async def run() -> None:
    settings = get_settings()
    database = Database.from_settings(settings)
    client = TemplateGenerationClient(settings)
    worker = CardTemplateGenerationWorker(database, settings, client)
    loop = asyncio.get_running_loop()
    for signame in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signame, worker.stop)
        except NotImplementedError:
            pass
    try:
        await worker.run_forever()
    finally:
        await client.close()
        await database.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
