"""
Minimal in-memory sliding-window rate limiter for login attempts.

LIMITATION: state lives in process memory — it resets on restart and is not
shared across workers. The current deployment runs a single uvicorn process
(Windows service), so this is sufficient. If the backend ever moves to
multiple workers, swap the store for a Mongo collection.
"""
import threading
import time

_lock = threading.Lock()
_attempts: dict[str, list[float]] = {}


def is_rate_limited(key: str, max_attempts: int, window_seconds: int) -> bool:
    """Return True when `key` has reached `max_attempts` within the window."""
    cutoff = time.monotonic() - window_seconds
    with _lock:
        timestamps = [t for t in _attempts.get(key, []) if t > cutoff]
        _attempts[key] = timestamps
        return len(timestamps) >= max_attempts


def record_failed_attempt(key: str) -> None:
    with _lock:
        _attempts.setdefault(key, []).append(time.monotonic())


def clear_attempts(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
