import asyncio
import logging
import signal

from s112.common.config import get_settings
from s112.common.database import Database
from s112.semantic_evaluation.client import SemanticEvaluationClient
from s112.semantic_evaluation.request_worker import SemanticEvaluationRequestWorker


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    database = Database.from_settings(settings)
    client = SemanticEvaluationClient(settings)
    worker = SemanticEvaluationRequestWorker(database, client, settings)

    loop = asyncio.get_running_loop()
    for signame in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signame, worker.stop)
        except NotImplementedError:
            pass
    try:
        await worker.run()
    finally:
        try:
            await client.close()
        finally:
            await database.dispose()


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
