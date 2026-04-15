"""
Stripe Billing helpers for Lupe Flow.

Pricing model (BRL):
  - Base plan monthly : R$ 39,90  (3990 centavos)
  - Base plan yearly  : R$ 445,30 (44530 centavos)

All Stripe amounts are in centavos (int).
"""

import os
import logging
import stripe

logger = logging.getLogger(__name__)

# ── Pricing constants (centavos BRL) ────────────────────────────────────────
BASE_MONTHLY_BRL_CENTS = 3990
BASE_YEARLY_BRL_CENTS  = 44530


def _get_stripe_client() -> None:
    """Configure the Stripe SDK with the secret key from the environment."""
    key = (
        os.getenv("STRIPE_API_KEY", "").strip()
        or os.getenv("STRIPE_SECRET_KEY", "").strip()
    )
    if not key:
        raise ValueError(
            "STRIPE_API_KEY não configurada. "
            "Adicione-a como secret no painel do Replit."
        )
    stripe.api_key = key


def _get_frontend_url() -> str:
    """
    Return the base URL used for Stripe success/cancel redirects.
    Checks FRONTEND_URL env var first, then falls back to REPLIT_DEV_DOMAIN.
    """
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url:
        return frontend_url.rstrip("/")

    dev_domain = os.getenv("REPLIT_DEV_DOMAIN", "").strip()
    if dev_domain:
        return f"https://{dev_domain}"

    return "https://lupe-flow-micro-entrepreneur-mvp.vercel.app"


def _build_line_items(plan_cycle: str) -> list[dict]:
    """
    Build line_items for the checkout session.

    - 'monthly' → mode=subscription → price_data includes 'recurring'
    - 'yearly'  → mode=payment      → price_data is one-time (no 'recurring')
    """
    is_yearly  = plan_cycle == "yearly"
    base_cents = BASE_YEARLY_BRL_CENTS if is_yearly else BASE_MONTHLY_BRL_CENTS
    base_label = (
        "Lupe Flow Premium — Plano Anual"
        if is_yearly else
        "Lupe Flow Premium — Plano Mensal"
    )

    pd: dict = {
        "currency":     "brl",
        "unit_amount":  base_cents,
        "product_data": {"name": base_label},
    }
    if not is_yearly:
        pd["recurring"] = {"interval": "month"}

    return [{"price_data": pd, "quantity": 1}]


def create_checkout_session(
    user_id: str,
    plan_cycle: str,
) -> str:
    """
    Create a Stripe Checkout Session for the given user and plan.

    Args:
        user_id:    Supabase user UUID (stored in session metadata for webhook use).
        plan_cycle: 'monthly' or 'yearly'.

    Returns:
        The Stripe Checkout Session URL to redirect the user to.

    Raises:
        ValueError:  If STRIPE_SECRET_KEY is not configured.
        stripe.StripeError: On Stripe API errors.
    """
    _get_stripe_client()

    base_url   = _get_frontend_url()
    line_items = _build_line_items(plan_cycle)
    is_yearly  = plan_cycle == "yearly"

    mode = "payment" if is_yearly else "subscription"

    session_metadata = {
        "user_id":    user_id,
        "plan_cycle": plan_cycle,
    }

    create_kwargs: dict = {
        "payment_method_types": ["card"],
        "line_items":           line_items,
        "mode":                 mode,
        "success_url":          f"{base_url}/pagamento-sucesso?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url":           f"{base_url}/pagamento-falha",
        "client_reference_id":  user_id,
        "metadata":             session_metadata,
    }

    if is_yearly:
        create_kwargs["payment_method_options"] = {
            "card": {"installments": {"enabled": True}}
        }
        create_kwargs["payment_intent_data"] = {"metadata": session_metadata}
    else:
        create_kwargs["subscription_data"] = {"metadata": session_metadata}

    session = stripe.checkout.Session.create(**create_kwargs)

    logger.info(
        f"Stripe session created: user='{user_id}' plan='{plan_cycle}' "
        f"session_id='{session.id}'"
    )
    return session.url


def retrieve_checkout_session(session_id: str):
    """Retrieve and return a Stripe Checkout Session by ID."""
    _get_stripe_client()
    return stripe.checkout.Session.retrieve(session_id)


def construct_webhook_event(payload: bytes, sig_header: str) -> dict:
    """
    Verify and parse a Stripe webhook event payload.

    Args:
        payload:    Raw request body bytes.
        sig_header: Value of the Stripe-Signature HTTP header.

    Returns:
        Parsed Stripe Event dict.

    Raises:
        ValueError: If STRIPE_WEBHOOK_SECRET is not set or signature is invalid.
        stripe.SignatureVerificationError: If the signature does not match.
    """
    _get_stripe_client()

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        raise ValueError(
            "STRIPE_WEBHOOK_SECRET não configurada. "
            "Adicione-a como secret no painel do Replit."
        )

    return stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
