"""Laya Playground API — minimal FastAPI wrapper around Laya's Router.

Flow: state + typed questions -> one forward pass -> calibrated answers.
Router is preloaded once at startup (lifespan), reused for every request.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent


class DecideRequest(BaseModel):
    state: Any = Field(description="Text or JSON document to decide over")
    questions: dict[str, Any] = Field(description="Typed questions: choice / score / noul")


def to_jsonable(value: Any) -> Any:
    """Coerce numpy scalars/arrays (from model output) into plain JSON types."""
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    if hasattr(value, "item") and hasattr(value, "ndim") and value.ndim == 0:
        return value.item()
    tolist = getattr(value, "tolist", None)
    if callable(tolist):
        try:
            return tolist()
        except (ValueError, TypeError):
            pass
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from laya import Router

        app.state.router = Router(preload=True)
        app.state.load_error = None
    except Exception as exc:  # missing dep or no Hub access -> degraded mode
        logger.warning("Router failed to load: %s: %s", type(exc).__name__, exc)
        app.state.router = None
        app.state.load_error = f"{type(exc).__name__}: {exc}"
    yield
    router = getattr(app.state, "router", None)
    if router is not None and hasattr(router, "unload"):
        try:
            router.unload()
        except Exception as exc:
            logger.debug("Router unload failed: %s", exc)


app = FastAPI(title="Laya Playground API", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)


@app.post("/decide")
def decide(req: DecideRequest) -> dict:
    router = getattr(app.state, "router", None)
    if router is None:
        raise HTTPException(
            status_code=503,
            detail=f"Router not loaded: {getattr(app.state, 'load_error', 'unknown')}",
        )
    try:
        result = router.predict(req.state, req.questions)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {type(exc).__name__}") from exc
    return to_jsonable(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="localhost", port=8000, reload=True)
