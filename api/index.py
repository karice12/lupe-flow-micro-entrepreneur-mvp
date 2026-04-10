import sys
import os
from pathlib import Path

# Adicionar o diretório raiz ao path para importar 'backend'
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

# Importar a aplicação FastAPI já configurada
from backend.main import app