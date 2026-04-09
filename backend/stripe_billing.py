"""
Stripe Billing helpers for Lupe Flow.

Pricing model (BRL):
  - Base plan monthly : R$ 29,90  (2990 centavos)
  - Base plan yearly  : R$ 29,90 × 12 × 0.93 ≈ R$ 333,45  (33345 centavos)
  - Extra bank monthly: R$ 7,99   (799 centavos / banco adicional)
  - Extra bank yearly : R$ 7,99 × 12 × 0.93 ≈ R$ 89,15   (8915 centavos)

All Stripe amounts are in centavos (int).
"""

import os
import logging
import stripe

logger = logging.getLogger(__name__)

# ── Pricing constants (centavos BRL) ────────────────────────────────────────
BASE_MONTHLY_BRL_CENTS   = 2990
EXTRA_BANK_MONTHLY_CENTS = 799
YEARLY_DISCOUNT          = 0.07          # 7 % off when paying annually

BASE_YEARLY_BRL_CENTS    = int(round(BASE_MONTHLY_BRL_CENTS   * 12 * (1 - YEARLY_DISCOUNT)))
EXTRA_BANK_YEARLY_CENTS  = int(round(EXTRA_BANK_MONTHLY_CENTS * 12 * (1 - YEARLY_DISCOUNT)))


def _get_stripe_client() -> None:
    """Configure the Stripe SDK with the secret key from the environment."""
    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise ValueError(
            "STRIPE_SECRET_KEY não configurada. "
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

    return "http://localhost:5000"


def _build_line_items(plan_cycle: str, extra_banks: int) -> list[dict]:
    """
    Build the Stripe line_items list for a checkout session.

    Args:
        plan_cycle:  'monthly' or 'yearly'
        extra_banks: Number of additional banks beyond the 1 included in base plan.

    Returns:
        List of price_data dicts ready for stripe.checkout.Session.create().
    """
    is_yearly = plan_cycle == "yearly"
    interval  = "year" if is_yearly else "month"

    base_cents  = BASE_YEARLY_BRL_CENTS  if is_yearly else BASE_MONTHLY_BRL_CENTS
    extra_cents = EXTRA_BANK_YEARLY_CENTS if is_yearly else EXTRA_BANK_MONTHLY_CENTS

    base_label  = (
        "Lupe Flow Premium — Plano Anual (7% off)"
        if is_yearly else
        "Lupe Flow Premium — Plano Mensal"
    )

    items = [
        {
            "price_data": {
                "currency": "brl",
                "unit_amount": base_cents,
                "recurring": {"interval": interval},
                "product_data": {"name": base_label},
            },
            "quantity": 1,
        }
    ]

    if extra_banks > 0:
        items.append(
            {
                "price_data": {
                    "currency": "brl",
                    "unit_amount": extra_cents,
                    "recurring": {"interval": interval},
                    "product_data": {
                        "name": f"Banco adicional — {'Anual' if is_yearly else 'Mensal'}"
                    },
                },
                "quantity": extra_banks,
            }
        )

    return items


def create_checkout_session(
    user_id: str,
    plan_cycle: str,
    extra_banks: int,
) -> str:
    """
    Create a Stripe Checkout Session for the given user and plan.

    Args:
        user_id:     Supabase user UUID (stored in session metadata for webhook use).
        plan_cycle:  'monthly' or 'yearly'.
        extra_banks: Number of extra billable bank connections (0 = only base plan).

    Returns:
        The Stripe Checkout Session URL to redirect the user to.

    Raises:
        ValueError:  If STRIPE_SECRET_KEY is not configured.
        stripe.StripeError: On Stripe API errors.
    """
    _get_stripe_client()

    base_url  = _get_frontend_url()
    line_items = _build_line_items(plan_cycle, extra_banks)

    # Propagate user_id into the Subscription object so that
    # the customer.subscription.deleted webhook can resolve the user.
    subscription_data: dict = {
        "metadata": {
            "user_id":    user_id,
            "plan_cycle": plan_cycle,
        }
    }

    # Installments: only meaningful for yearly (one-time larger charge).
    # enabled=True surfaces the installment UI on the Stripe-hosted page;
    # plan counts and interest rules are governed by the Stripe Dashboard
    # (Brazil cartão parcelado). For 1-3 installments the merchant absorbs
    # the fee (commitment_count=0); beyond 3 the Dashboard rate applies.
    payment_method_options: dict = {}
    if plan_cycle == "yearly":
        payment_method_options = {
            "card": {
                "installments": {
                    "enabled": True,
                }
            }
        }

    create_kwargs: dict = {
        "payment_method_types": ["card"],
        "line_items":           line_items,
        "mode":                 "subscription",
        "success_url":          f"{base_url}/pagamento-sucesso?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url":           f"{base_url}/pagamento-falha",
        "client_reference_id":  user_id,
        "subscription_data":    subscription_data,
        "metadata": {
            "user_id":     user_id,
            "plan_cycle":  plan_cycle,
            "extra_banks": str(extra_banks),
        },
    }
    if payment_method_options:
        create_kwargs["payment_method_options"] = payment_method_options

    session = stripe.checkout.Session.create(**create_kwargs)

    logger.info(
        f"Stripe session created: user='{user_id}' plan='{plan_cycle}' "
        f"extra_banks={extra_banks} session_id='{session.id}'"
    )
    return session.url


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
