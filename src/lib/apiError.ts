export function extractApiError(data: unknown, fallback = "Erro inesperado."): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as Record<string, unknown>).detail;
  if (typeof detail === "string") return detail || fallback;
  if (detail && typeof detail === "object") {
    const msg = (detail as Record<string, unknown>).message;
    if (typeof msg === "string") return msg || fallback;
  }
  return fallback;
}

export function extractCheckoutUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const detail = (data as Record<string, unknown>).detail;
  if (detail && typeof detail === "object") {
    const url = (detail as Record<string, unknown>).checkout_url;
    if (typeof url === "string" && url) return url;
  }
  return null;
}
