"""Best-effort, in-process notification wake-ups for SSE clients.

The database remains the source of truth. This transport deliberately requires no
Redis service and never blocks a business transaction. It works across threads in
one Django process; multi-process deployments recover missed events through the
SSE endpoint's low-frequency database reconciliation.
"""
from queue import Queue, Full
from threading import Lock
from typing import Dict, Set

_lock = Lock()
_subscribers: Dict[int, Set[Queue]] = {}


def subscribe(profile_id: int) -> Queue:
    channel: Queue = Queue(maxsize=100)
    with _lock:
        _subscribers.setdefault(int(profile_id), set()).add(channel)
    return channel


def unsubscribe(profile_id: int, channel: Queue) -> None:
    with _lock:
        channels = _subscribers.get(int(profile_id))
        if channels:
            channels.discard(channel)
            if not channels:
                _subscribers.pop(int(profile_id), None)


def publish_notification(notification_id: int, profile_id: int) -> None:
    """Wake same-process subscribers; durable notification data stays in PostgreSQL."""
    event = int(notification_id)
    with _lock:
        channels = tuple(_subscribers.get(int(profile_id), ()))
    for channel in channels:
        try:
            channel.put_nowait(event)
        except Full:
            # A full queue simply triggers normal reconciliation; never block writes.
            pass
