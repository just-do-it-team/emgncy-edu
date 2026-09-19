from __future__ import annotations

from s112.realtime_gateway.hub import RealtimeHub


async def test_realtime_hub_filters_events_by_card() -> None:
    hub = RealtimeHub(queue_size=10)
    async with hub.subscribe(card_id="card-1") as first:
        async with hub.subscribe(card_id="card-2") as second:
            delivered = await hub.publish(
                {
                    "event_id": "event-1",
                    "event_type": "card.updated",
                    "aggregate_id": "card-1",
                }
            )

            assert delivered == 1
            assert (await first.queue.get())["event_id"] == "event-1"
            assert second.queue.empty()


async def test_realtime_hub_marks_queue_gap_on_overflow() -> None:
    hub = RealtimeHub(queue_size=1)
    async with hub.subscribe() as subscription:
        await hub.publish({"event_id": "1", "aggregate_id": "card-1"})
        await hub.publish({"event_id": "2", "aggregate_id": "card-1"})

        event = await subscription.queue.get()
        assert event["event_type"] == "stream.gap"
        assert event["data"]["resync_required"] is True


async def test_realtime_hub_filters_events_by_workspace() -> None:
    hub = RealtimeHub(queue_size=10)
    async with hub.subscribe(workspace_id="workspace-1") as first:
        async with hub.subscribe(workspace_id="workspace-2") as second:
            delivered = await hub.publish(
                {
                    "event_id": "event-1",
                    "event_type": "card.created",
                    "aggregate_id": "card-1",
                    "workspace_id": "workspace-1",
                }
            )

            assert delivered == 1
            assert (await first.queue.get())["event_id"] == "event-1"
            assert second.queue.empty()
