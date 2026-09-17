# Companion Service API Contract

This document defines the integration surface for the WHO-grounded lifestyle
companion — a chat button/panel available across the app
(`components/companion/CompanionPanel.tsx`), backed by a local Ollama
instance running `medgemma`.

Implementation: [`app/api/companion/message/route.ts`](app/api/companion/message/route.ts).

---

## Endpoint

```
POST /api/companion/message
```

Requires an authenticated session (same cookie-based auth as every other
route) — a logged-out request gets `401`.

---

## Request

```json
{
  "message": "string",                         // User's latest message
  "history": [                                  // Optional — prior turns, most recent last
    { "role": "user" | "assistant", "content": "string" }
  ]
}
```

`history` is capped server-side to the last 12 messages before being sent to
the model. It's kept client-side only — there's no server-side chat session.

> ⚠️ **Data firewall note**: Individual screening scores, risk tiers, or family
> member records MUST NOT be forwarded to the companion. Only the free-text
> conversation is sent. This is enforced by construction: nothing in
> `app/api/companion/` reads from `risk_scores`, `screening_responses`, or
> `family_members`.

---

## Response

Success (`200`):
```json
{ "reply": "string" }
```

Ollama unreachable, errored, or returned an empty response (`503`):
```json
{ "error": "string" }
```
`CompanionPanel` shows this (or a local fallback string) as the assistant's
message rather than failing silently.

---

## Constraints (non-negotiable)

1. The companion must **never generate a risk tier, diagnosis, or medication
   advice**. Its scope is lifestyle guidance (diet, activity, stress
   management), grounded in WHO-style guidance — enforced via the system
   prompt in `app/api/companion/message/route.ts`, not left to the model's
   judgment.
2. Every response should include an implicit or explicit reminder that it is
   not clinical advice, and should point to a clinician for anything
   concerning.
3. Requests to Ollama time out at 30s; on timeout, error, or an empty
   response the route returns `503` rather than hanging or crashing.

---

## Running it

Ollama itself is not part of this repo. Start it locally with `medgemma`
pulled, then set in `.env.local` (defaults already match a stock local
install):

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=medgemma1.5:latest
```

If your local model tag differs (e.g. a specific quantization or version
suffix from `ollama list`), set `OLLAMA_MODEL` to match exactly.
