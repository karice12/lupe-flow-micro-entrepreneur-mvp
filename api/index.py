import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from backend.main import app


class _StripApiPrefix(BaseHTTPMiddleware):
    """
    Strip /api/ prefix before FastAPI routing.

    Vite dev proxy rewrites /api/saldos -> localhost:8000/saldos (prefix stripped).
    Vercel serverless passes the full path, so we strip it here to match the same
    route definitions. /webhook/* paths are unchanged as FastAPI already defines them.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path", "")
        if path.startswith("/api/"):
            stripped = path[4:]
            request.scope["path"] = stripped
            request.scope["raw_path"] = stripped.encode()
        return await call_next(request)


app.add_middleware(_StripApiPrefix)

handler = app
