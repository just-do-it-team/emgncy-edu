import asyncio
import logging

from s112.common.config import get_settings
from s112.common.database import Database
from s112.scenario_worker.worker import ScenarioSchedulerWorker


async def run() -> None:
    settings = get_settings()
    database = Database.from_settings(settings)
    worker = ScenarioSchedulerWorker(
        database,
        settings.kafka_topic,
        batch_size=settings.scenario_worker_batch_size,
        retry_limit=settings.scenario_worker_retry_limit,
    )
    try:
        await worker.run_forever(settings.scenario_worker_poll_interval_seconds)
    finally:
        await database.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
