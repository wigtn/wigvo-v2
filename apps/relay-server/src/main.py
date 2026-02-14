import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes.calls import router as calls_router
from src.routes.health import router as health_router
from src.routes.stream import router as stream_router
from src.routes.twilio_webhook import router as twilio_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("wigvo-relay")

# In-memory store for active calls (call_id -> ActiveCall)
active_calls: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "WIGVO Relay Server starting on %s:%s",
        settings.relay_server_host,
        settings.relay_server_port,
    )
    logger.info("Call mode: %s", settings.call_mode)
    yield
    # Graceful shutdown: close active sessions
    logger.info("Shutting down — %d active calls", len(active_calls))
    active_calls.clear()


app = FastAPI(
    title="WIGVO Relay Server",
    version="3.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(calls_router, prefix="/relay")
app.include_router(stream_router, prefix="/relay")
app.include_router(twilio_router, prefix="/twilio")
