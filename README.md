# T2D Family Risk Screening Platform

**Challenge 1.2 — Future Health Connectathon 2026, Tunisia**

A modular, clinical-grade web app for family-based Type 2 diabetes risk screening and referral.

---

## Quick Start

### Prerequisites
- Node.js 24+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`)

### 1. Install dependencies
```bash
npm install
```

### 2. Start local Supabase
```bash
npx supabase start
```
Copy the output `anon key` and `service_role key` into `.env.local`.

### 3. Run database migrations
```bash
npx supabase db reset
# or apply individually:
npx supabase migration up
```

### 4. Copy env file
```bash
cp .env.local.example .env.local
# Fill in values from `supabase start` output
```

### 5. Start the app
```bash
npm run dev
```

App runs at **http://localhost:3000**

---

## Project Structure

```
app/
├── (auth)/auth/login/     # Magic-link login
├── (onboarding)/          # Household creation & member management
├── (screening)/           # DIABSCORE questionnaire + score display
├── (referral)/            # Referral tracking + pharmacist view
├── (dashboard-payer)/     # CNAM/insurer aggregate-only dashboard
└── api/                   # API routes
    ├── households/
    ├── screening/
    ├── scoring-webhook/   # Called by n8n OR directly
    ├── referral/
    └── companion/message/ # Stub — see COMPANION_API_CONTRACT.md

lib/
├── scoring/               # DIABSCORE pure function + unit tests
├── validation/            # Zod schemas (shared form + API)
├── supabase/              # Browser / server / middleware clients
└── referral/              # State machine

supabase/migrations/       # Run in order: 001 → 004
n8n-workflows/             # Import into n8n UI
messages/                  # i18n: fr.json (complete), ar.json (skeleton)
```

---

## Scoring Formula

**DIABSCORE** (validated for Tunisian population, Cap-Bon study):

```
score = age + (waist_cm / height_cm × 100) + (family_history_t2d ? 10 : 0) + (gestational_diabetes ? 25 : 0)
```

Optional FINDRISC-lite: `+5` low activity | `+3` poor diet | `+5` BP medication

| Tier | Score |
|------|-------|
| 🟢 Low | < 80 |
| 🟡 Moderate | 80–89 |
| 🔴 High | ≥ 90 |

Formula version: **`diabscore-v1.0`** — stored with every score row.

---

## Running Tests

```bash
# Scoring engine unit tests (tier boundary coverage)
npx vitest run lib/scoring/

# Type check
npx tsc --noEmit
```

---

## Data Firewall

The `payer_readonly` Postgres role has `SELECT` on `aggregate_outcomes` **only**.
All individual tables are explicitly revoked. Verify with:

```sql
SET ROLE payer_readonly;
SELECT * FROM risk_scores;          -- ❌ Must fail: permission denied
SELECT * FROM aggregate_outcomes;   -- ✅ Must succeed
```

---

## n8n Workflows (optional, for async scoring)

Import the JSON files from `n8n-workflows/` into your n8n instance.
Without n8n, call `POST /api/scoring-webhook` directly for synchronous scoring.
