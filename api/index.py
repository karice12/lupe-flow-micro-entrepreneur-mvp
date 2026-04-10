import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.main import app as _backend_app


class _StripApiPrefix:
    """
    ASGI middleware that strips the /api prefix from request paths.

    Vite dev proxy: rewrites /api/saldos → localhost:8000/saldos (prefix stripped).
    Vercel production: /api/saldos arrives at this function with the full path,
    so we strip /api here to match the same FastAPI route definitions.

    /webhook/* paths are passed through unchanged because FastAPI already
    defines those routes without an /api prefix.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            path: str = scope.get("path", "")
            if path.startswith("/api/"):
                new_path = path[4:]
                scope = dict(scope)
                scope["path"] = new_path
                scope["raw_path"] = new_path.encode()
        await self.app(scope, receive, send)


app = _StripApiPrefix(_backend_app)
handler = app
