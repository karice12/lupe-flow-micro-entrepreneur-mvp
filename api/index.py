import sys
import os
from pathlib import Path
import logging

# Configuração para o Vercel conseguir ler os logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Mostra para o sistema onde estão os arquivos do backend
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

# Importa o aplicativo principal do backend
try:
    from backend.main import app
    logger.info("App importado com sucesso!")
except Exception as e:
    logger.error(f"Erro CRÍTICO ao importar o app: {e}", exc_info=True)
    raise

# Essa linha é obrigatória para o Vercel reconhecer o FastAPI
__all__ = ['app']