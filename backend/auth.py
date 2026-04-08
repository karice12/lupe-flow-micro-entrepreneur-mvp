import logging
from typing import Optional
from fastapi import Header, HTTPException
from backend.storage import get_supabase

logger = logging.getLogger(__name__)


async def get_token_user_id(
    authorization: Optional[str] = Header(default=None),
) -> str:
    """
    FastAPI dependency — validates the Supabase Bearer JWT.
    Returns the authenticated user's UUID string.
    Raises HTTP 401 if the token is missing, malformed, or expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autorização ausente. Inclua o header: Authorization: Bearer <token>",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token vazio no header de autorização.")

    try:
        sb = get_supabase()
        response = sb.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
        return str(response.user.id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"JWT validation error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=401,
            detail=f"Falha na validação do token: {type(e).__name__}",
        )


def assert_owns_resource(token_user_id: str, resource_user_id: str) -> None:
    """
    Raises HTTP 403 if the authenticated user is not the owner of the
    resource being accessed/modified.
    """
    if token_user_id != resource_user_id:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: o token não pertence ao usuário informado.",
        )
