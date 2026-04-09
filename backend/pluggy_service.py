"""
Pluggy Open Banking service for Lupe Flow.

Authentication flow:
  1. POST /auth   → exchange clientId + clientSecret for a short-lived apiKey
  2. POST /connect_token → exchange apiKey + clientUserId for a Connect Token
                           that the frontend Widget uses to link bank accounts.
"""

import os
import logging
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

PLUGGY_BASE_URL = "https://api.pluggy.ai"
FRONTEND_ORIGIN = os.getenv(
    "FRONTEND_URL",
    "https://bab74352-1261-483b-8427-3cb267a7e4fd-00-3eb0av1fpy01n.spock.replit.dev",
).strip()


def _get_credentials() -> tuple[str, str]:
    client_id     = os.getenv("PLUGGY_CLIENT_ID", "").strip()
    client_secret = os.getenv("PLUGGY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Integração Pluggy não configurada. "
                "Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nos Secrets do Replit."
            ),
        )
    logger.info(f"Pluggy credentials loaded: client_id={client_id[:8]}...")
    return client_id, client_secret


def _get_api_key(client_id: str, client_secret: str) -> str:
    """Authenticate with Pluggy and return a short-lived API key."""
    try:
        response = httpx.post(
            f"{PLUGGY_BASE_URL}/auth",
            headers={"Origin": FRONTEND_ORIGIN},
            json={"clientId": client_id, "clientSecret": client_secret},
            timeout=10.0,
        )
        logger.info(f"Pluggy /auth response: status={response.status_code}")
        response.raise_for_status()
        api_key = response.json().get("apiKey")
        if not api_key:
            raise ValueError("Resposta da Pluggy não contém 'apiKey'.")
        return api_key
    except httpx.HTTPStatusError as e:
        logger.error(
            f"ERRO DETALHADO PLUGGY /auth: status={e.response.status_code} "
            f"body={e.response.text}"
        )
        print(f"ERRO DETALHADO PLUGGY: {e.response.text}", flush=True)
        raise HTTPException(
            status_code=502,
            detail=f"Falha na autenticação com a Pluggy: {e.response.status_code} — {e.response.text}",
        )
    except Exception as e:
        logger.error(f"Pluggy auth error: {type(e).__name__}: {e}")
        print(f"ERRO DETALHADO PLUGGY: {type(e).__name__}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"Erro ao autenticar com a Pluggy: {e}")


def generate_connect_token(user_id: str) -> str:
    """
    Generate a Pluggy Connect Token for the given user.

    Args:
        user_id: The authenticated Supabase user UUID, used as clientUserId
                 so Pluggy can associate the Item with this user.

    Returns:
        The Connect Token (accessToken) string for use in the Pluggy Widget.
    """
    client_id, client_secret = _get_credentials()
    api_key = _get_api_key(client_id, client_secret)

    try:
        response = httpx.post(
            f"{PLUGGY_BASE_URL}/connect_token",
            headers={
                "X-API-KEY": api_key,
                "Origin": FRONTEND_ORIGIN,
            },
            json={"clientUserId": user_id},
            timeout=10.0,
        )
        logger.info(f"Pluggy /connect_token response: status={response.status_code}")
        response.raise_for_status()
        access_token = response.json().get("accessToken")
        if not access_token:
            raise ValueError("Resposta da Pluggy não contém 'accessToken'.")
        logger.info(f"Pluggy connect token generated for user '{user_id}'")
        return access_token
    except httpx.HTTPStatusError as e:
        logger.error(
            f"ERRO DETALHADO PLUGGY /connect_token: status={e.response.status_code} "
            f"body={e.response.text}"
        )
        print(f"ERRO DETALHADO PLUGGY: {e.response.text}", flush=True)
        raise HTTPException(
            status_code=502,
            detail=f"Falha ao gerar Connect Token da Pluggy: {e.response.status_code} — {e.response.text}",
        )
    except Exception as e:
        logger.error(f"Pluggy connect_token error: {type(e).__name__}: {e}")
        print(f"ERRO DETALHADO PLUGGY: {type(e).__name__}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"Erro ao gerar Connect Token: {e}")
