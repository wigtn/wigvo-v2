"""Rate limit middleware tests."""

import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.middleware.rate_limit import RateLimitMiddleware


def _make_request(host: str = "127.0.0.1"):
    """Create a mock Request with a given client host."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = host
    return request


@pytest.fixture
def middleware():
    app = MagicMock()
    return RateLimitMiddleware(app, calls_per_minute=5)


@pytest.mark.asyncio(loop_scope="function")
async def test_allows_requests_under_limit(middleware):
    """Requests under the rate limit should pass through."""
    call_next = AsyncMock(return_value="ok")
    request = _make_request()

    for _ in range(5):
        result = await middleware.dispatch(request, call_next)
        assert result == "ok"

    assert call_next.call_count == 5


@pytest.mark.asyncio(loop_scope="function")
async def test_blocks_after_limit(middleware):
    """Requests exceeding the rate limit should get 429."""
    from fastapi import HTTPException

    call_next = AsyncMock(return_value="ok")
    request = _make_request()

    for _ in range(5):
        await middleware.dispatch(request, call_next)

    with pytest.raises(HTTPException) as exc_info:
        await middleware.dispatch(request, call_next)

    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail


@pytest.mark.asyncio(loop_scope="function")
async def test_separate_counters_per_ip(middleware):
    """Different IPs should have independent rate limit counters."""
    from fastapi import HTTPException

    call_next = AsyncMock(return_value="ok")

    req_a = _make_request("10.0.0.1")
    req_b = _make_request("10.0.0.2")

    # Fill IP A's quota
    for _ in range(5):
        await middleware.dispatch(req_a, call_next)

    # IP A should be blocked
    with pytest.raises(HTTPException) as exc_info:
        await middleware.dispatch(req_a, call_next)
    assert exc_info.value.status_code == 429

    # IP B should still be allowed
    result = await middleware.dispatch(req_b, call_next)
    assert result == "ok"


@pytest.mark.asyncio(loop_scope="function")
async def test_window_cleanup(middleware):
    """Old entries outside the 60s window should be cleaned up."""
    call_next = AsyncMock(return_value="ok")
    request = _make_request()

    # Manually inject old timestamps (older than 60s)
    ip = "127.0.0.1"
    old_time = time.time() - 120  # 2 minutes ago
    middleware._requests[ip] = [old_time] * 5

    # Should still allow because old entries get cleaned
    result = await middleware.dispatch(request, call_next)
    assert result == "ok"

    # Old entries should be removed, only the new one remains
    assert len(middleware._requests[ip]) == 1
