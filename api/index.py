import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.main import app as _app


class StripMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/api"):
            scope["path"] = scope["path"][4:]
        return await self.app(scope, receive, send)


app = StripMiddleware(_app)
