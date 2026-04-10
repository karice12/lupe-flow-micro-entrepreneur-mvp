import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.main import app

app = app
handler = app
