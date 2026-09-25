import asyncio
import logging
import signal

from s112.audio.recording_worker import CallRecordingWorker
from s112.audio.storage import SeaweedStorage
from s112.common.config import get_settings
from s112.common.database import Database
from s112.speech_worker.client import SpeechModelClient


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    database = Database.from_settings(settings)
    storage = SeaweedStorage(settings)
    speech = SpeechModelClient(settings)
    worker = CallRecordingWorker(database, storage, speech, settings)

    loop = asyncio.get_running_loop()
    for signame in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signame, worker.stop)
        except NotImplementedError:
            pass
    try:
        await worker.run()
    finally:
        await speech.close()
        await storage.close()
        await database.dispose()


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
