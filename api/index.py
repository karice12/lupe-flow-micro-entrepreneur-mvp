import sys
import os
from pathlib import Path

# Adiciona a pasta raiz ao caminho do Python
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

# Importa o app do seu backend
try:
    from backend.main import app as application
    # O Vercel às vezes prefere o nome 'app', outras 'application' ou 'handler'
    app = application
    handler = application
except Exception as e:
    print(f"Erro ao importar: {e}")
    raise e