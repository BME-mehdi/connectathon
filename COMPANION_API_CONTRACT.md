# Companion Service API Contract

This document defines the integration surface between the T2D Screening Platform
and the external WHO-companion lifestyle assistant (built by the companion team).

---

## Endpoint

```
POST /api/companion/message
```

The platform's stub implementation lives in
[`app/api/companion/message/route.ts`](app/api/companion/message/route.ts).
The companion team replaces the stub body with a real call to their service.

---

## Request

```json
{
  "message": "string",        // User's natural-language question
  "household_id": "uuid",     // For session context (no individual clinical data sent)
  "locale": "fr" | "ar"       // UI locale
}
```

> ⚠️ **Data firewall note**: Individual screening scores, risk tiers, or family member records
> MUST NOT be forwarded to the companion service. The companion receives only the user's
> freeform text message and a household_id for session continuity.

---

## Response

```json
{
  "reply": "string",          // Markdown-safe plain text (no HTML)
  "sources": ["string"]       // Optional: citation URLs or document titles
}
```

---

## Constraints (non-negotiable)

1. The companion service must **never generate a risk tier, diagnosis, or medication advice**.
   Its scope is lifestyle guidance (diet, activity, stress management) grounded in WHO resources.
2. All responses must include an implicit or explicit disclaimer that they are not clinical advice.
3. Latency target: < 5 seconds (UI shows typing indicator while waiting).
4. If the service is unavailable, return HTTP 503 — the platform will show a graceful fallback message.

---

## Stub response (current)

```json
{
  "reply": "Le service d'accompagnement est en cours de finalisation. En attendant, consultez votre médecin ou pharmacien pour toute question de santé.",
  "sources": []
}
```
