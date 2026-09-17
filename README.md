# T2D Family Risk Screening Platform

**Challenge 1.2 — Future Health Connectathon 2026, Tunisia**

A modular, clinical-grade web app for family-based Type 2 diabetes risk screening
and referral. Each consenting adult in a household completes a short, clinically
validated questionnaire (DIABSCORE); anyone flagged high-risk is automatically
routed to a confirmatory blood test at a partner pharmacy.

The product is distributed **B2B2C** — bundled into an insurance family policy or
a CNAM enrollment touchpoint, never sold as a standalone self-screening tool
(that would let people game insurance pricing). This constrains the architecture
even where it isn't visible in the UI: **individual screening data must never be
reachable by a payer-facing role**, and **no score or referral confirmation may
ever come from anything but a deterministic formula or a human professional**.
Those two rules are non-negotiable and are called out everywhere they touch the
code below.

---

## 1. Architecture overview

Three layers, deliberately kept separate so each can change independently:

```
                    ┌─────────────────────────────────────────────┐
                    │              Next.js 15 (App Router)         │
                    │  UI (feature-grouped route segments)         │
                    │  + API routes (validation, writes, orchestr.)│
                    └───────────────┬───────────────────┬─────────┘
                                    │                     │
                     reads/writes,  │                     │ webhook
                     RLS-enforced   ▼                     ▼ trigger
                    ┌───────────────────────┐   ┌─────────────────────┐
                    │  Supabase Postgres     │   │  n8n                │
                    │  - system of record    │◄──┤  - scoring workflow │
                    │  - RLS + payer_readonly│   │  - referral workflow│
                    │    role (data firewall)│   │  - reminders (cron) │
                    └───────────────────────┘   └─────────────────────┘
```

- **Next.js** owns everything user-facing and every write path. It never
  computes a risk score itself — it only validates input and hands off.
- **Supabase Postgres** is the single system of record. Row-Level Security
  (RLS) is the *primary* enforcement mechanism for household isolation and for
  the payer data firewall — not a convention layered on top of app code.
- **n8n** owns the one piece of business logic that must be swappable without
  a redeploy: the DIABSCORE formula and the referral/reminder orchestration
  that follows a score. It is versioned JSON, checked into `n8n-workflows/`.

A fourth, intentionally thin surface exists for the **WHO lifestyle
companion**, built by a separate team: this repo only owns the request/response
contract and a stub endpoint (see [§8](#8-companion-integration-surface---the-one-deliberate-seam)).

### End-to-end data flow

```
adult fills intake  →  POST /api/screening        (Next.js: validate + insert)
                              │
                              ▼
                    screening_responses row written
                              │
                    fire-and-forget webhook
                              ▼
                    n8n: Scoring Workflow           (deterministic, versioned)
                              │
                              ▼
                    risk_scores row written (formula_version stamped)
                              │
                    tier === 'high'?
                              ▼
                    n8n: Referral Workflow  →  referrals row (status: flagged)
                                             →  nearest partner_pharmacy assigned
                              │
                    patient picks a slot in the UI  →  appointments row
                              │
                    pharmacist manually confirms   →  status: physician_confirmed
                              │
                    nightly job refreshes aggregate_outcomes (materialized view)
                              │
                    payer dashboard reads ONLY aggregate_outcomes
```

---

## 2. Why modular, and how ownership maps to folders

This is being built by several people/agents in parallel (clinical logic,
scoring, referral/scheduling, payer dashboard, companion team), so the
codebase is organized **by feature domain, not by file type** — nobody should
need to touch a folder outside their module to ship their piece. Cross-cutting
contracts (Zod schemas, the scoring function, the state machine) are pulled out
into `lib/` specifically so two features can depend on the *same* validated
shape without duplicating it.

| Module | Folders | Owns | Touches which non-negotiable |
|---|---|---|---|
| **Onboarding & consent** | `app/(onboarding)/`, `app/(auth)/`, `app/auth/`, `app/api/households`, `app/api/invite/*`, `app/api/members` | Household creation, adult invite + self-consent, guardian-added minors | Layered consent (self / guardian / surface-level) must never be conflated |
| **Screening & scoring** | `app/(screening)/`, `app/api/screening`, `app/api/scoring-webhook`, `lib/scoring/`, `lib/validation/screening.ts` | The DIABSCORE questionnaire, non-diagnostic result display | **Deterministic, versioned scoring** — never an LLM |
| **Referral & scheduling** | `app/(referral)/`, `app/api/referral/*`, `lib/referral/stateMachine.ts`, `n8n-workflows/referral-workflow.json`, `n8n-workflows/reminder-workflow.json` | Pharmacy assignment, slot booking, pharmacist confirmation | `physician_confirmed` is manual-only, never automated |
| **Payer dashboard** | `app/(dashboard-payer)/` | Aggregate-only CNAM/insurer view | **The data firewall** — architecturally blocked from individual records |
| **Companion (stub)** | `app/api/companion/`, `components/companion/`, `COMPANION_API_CONTRACT.md` | The integration seam only — no prompting/model logic lives here | Never receives individual scores or clinical data |
| **Shared foundation** | `lib/supabase/`, `lib/validation/`, `components/ui/`, `supabase/migrations/`, `supabase/policies` (RLS) | Auth clients, Zod schemas used by 2+ modules, shadcn primitives, schema + RLS | Both non-negotiables are ultimately enforced here |

The rule of thumb: a module's **page + API route** can be rewritten freely; a
module's **Zod schema and DB migration** are contracts other modules read, so
changes there should be additive (new columns/fields, not renamed ones)
whenever two modules are being worked on at once.

---

## 3. Directory structure (current)

```
app/
├── (auth)/auth/login/                  # Magic-link (email OTP) login
├── auth/callback/                      # Exchanges the magic-link code for a session;
│                                        # supports ?next= for the invite-accept redirect
├── (onboarding)/onboarding/
│   ├── page.tsx                        # Entry: create household or resume
│   ├── create/                         # Household name + governorate
│   ├── members/                        # List members; add-minor / invite-adult CTAs
│   │   └── add/                        # Guardian adds a minor (no health data collected)
│   ├── invite/                         # Owner invites another adult by email
│   └── accept/                         # Invitee authenticates, enters THEIR OWN data,
│                                        # grants self-consent — never done on their behalf
├── (screening)/screening/
│   ├── page.tsx                        # Member picker (adults only)
│   └── [memberId]/
│       ├── page.tsx                    # DIABSCORE + optional FINDRISC-lite form
│       └── result/                     # Non-diagnostic score display
├── (referral)/referral/
│   ├── page.tsx                        # Patient's own referrals
│   ├── [referralId]/
│   │   ├── page.tsx                    # Referral detail + status
│   │   └── book/                       # Pick a pharmacy appointment slot
│   └── pharmacist/                     # Pharmacist queue — the only place that
│                                        # can set status: physician_confirmed
├── (dashboard-payer)/dashboard/        # CNAM / insurer aggregate-only view
├── page.tsx                            # Redirects to /auth/login or /onboarding
└── api/
    ├── households/                     # POST create household
    ├── invite/                         # POST send adult invite
    │   └── accept/                     # POST finalize joining (service-role, invite-gated)
    ├── members/                        # POST/GET add & list family members
    ├── screening/                      # POST intake → triggers n8n scoring webhook
    ├── scoring-webhook/                # Computes DIABSCORE, writes risk_scores
    │                                   # (callable directly if n8n isn't running)
    ├── referral/                       # PATCH status transitions (state-machine gated)
    │   └── confirm/                    # POST pharmacist-only physician_confirmed
    └── companion/message/              # Stub — see COMPANION_API_CONTRACT.md

components/
├── ui/                                 # shadcn/ui primitives (RTL-enabled for Arabic)
└── companion/CompanionPanel.tsx        # Chat panel, posts to /api/companion/message

lib/
├── scoring/
│   ├── diabscore.ts                    # Pure, deterministic, versioned function
│   ├── diabscore.test.ts               # Boundary coverage for every tier
│   └── index.ts                        # Public exports (FORMULA_VERSION, TIER_LABELS, ...)
├── validation/
│   ├── screening.ts                    # Household/member/consent/screening/referral schemas
│   └── invite.ts                       # Adult-invite + accept schemas
├── referral/
│   └── stateMachine.ts                 # Allowed transitions + which role may trigger each
└── supabase/
    ├── client.ts                       # Browser client (anon key)
    ├── server.ts                       # Server client (cookie session) + service-role client
    └── middleware.ts                   # Session refresh + route protection

supabase/
├── config.toml                         # Local Supabase CLI project config
└── migrations/
    ├── 001_initial_schema.sql          # All tables + aggregate_outcomes view
    ├── 002_rls_policies.sql            # Household-scoped RLS, pharmacist policies
    ├── 003_data_firewall.sql           # payer_readonly role: GRANT view, REVOKE tables
    └── 004_seed_pharmacies.sql         # Demo partner pharmacies (one per governorate)

n8n-workflows/                          # Exported, versioned workflow JSON
├── scoring-workflow.json               # Mirrors lib/scoring/diabscore.ts exactly
├── referral-workflow.json              # High-risk → pharmacy assignment → referral row
└── reminder-workflow.json              # Daily cron: upcoming/overdue notifications (stub)

messages/                               # i18n scaffolding (next-intl not yet wired to routing)
├── fr.json                             # Complete — the language the demo ships in
└── ar.json                             # Skeleton — RTL is already on at the shadcn/Tailwind level

COMPANION_API_CONTRACT.md               # Request/response contract for the external team
.env.example                            # All required env vars, documented
vitest.config.ts                        # Test runner config (lib/**/*.test.ts)
```

---

## 4. Data model & the technical data firewall

All tables live in `supabase/migrations/001_initial_schema.sql`:

| Table | Purpose | Access |
|---|---|---|
| `households` | Owner + governorate | Owner only |
| `family_members` | One row per person (adult or minor); `user_id` is null for minors | Household-scoped RLS |
| `consents` | Append-only. `consent_type`: `self` \| `guardian` \| `surface_family_history` | Insert-only RLS, no update/delete policy exists |
| `screening_responses` | DIABSCORE inputs + optional FINDRISC-lite fields | Household-scoped RLS |
| `risk_scores` | `score_value`, `tier`, `formula_version` — one row per computed score, never overwritten | Household-scoped RLS; no client INSERT policy (only the service-role scoring path writes) |
| `partner_pharmacies` | Public metadata | Public read |
| `referrals` | State machine: `flagged → scheduled → completed/no_show → physician_confirmed` | Household-scoped read; pharmacist-scoped update |
| `appointments` | Booked slot + `confirmed_by_pharmacist_at` | Household-scoped + pharmacist RLS |
| `audit_log` | Append-only action trail (consent grants, referral transitions) | Insert-only |
| `aggregate_outcomes` | Materialized view: region × month → cohort size, % high-risk, % referral completed, % confirmed prediabetes. **Zero individual identifiers.** | The only thing a payer role may ever touch |

### The firewall, concretely

`supabase/migrations/003_data_firewall.sql` creates a dedicated `payer_readonly`
Postgres role: `GRANT SELECT` on `aggregate_outcomes` only, `REVOKE ALL` on
every individual table. This is meant to be a second, independent layer under
the RLS policies in `002_rls_policies.sql` — so that even a bug in a dashboard
component, or a missed RLS policy somewhere, still can't leak an individual
record, because the *role* itself has no grant to leak.

> **Current limitation, flagged for anyone picking this up:** `payer_readonly`
> exists in the database but the payer dashboard page currently authenticates
> with the same Supabase client every other page uses (`authenticated` role),
> not with `payer_readonly`. Wiring this correctly needs either a custom-claim
> auth hook + PostgREST role-switching, or (the more reliable path for a local
> CLI setup) a server route that opens a direct Postgres connection and runs
> `SET LOCAL ROLE payer_readonly` before querying. Until one of those lands,
> the firewall is real SQL but not yet load-bearing at runtime — treat it as
> the next thing to close before a payer partner pokes at this.

---

## 5. The two non-negotiables, in depth

### 5.1 Deterministic, versioned scoring

`lib/scoring/diabscore.ts` is a pure function — no I/O, no randomness, no model
call. It is the **only** place the formula is defined for the Next.js side;
`n8n-workflows/scoring-workflow.json` carries an intentionally identical
JS mirror inside its Function node (n8n needs its own copy because the
workflow can be edited and redeployed independently of the app — that's the
whole point of putting scoring there instead of only in an API route). Both
copies are pinned to the same `FORMULA_VERSION` constant, and every
`risk_scores` row stores which version produced it, so recalibrating the
formula later never rewrites history.

```
DIABSCORE = age
          + (waist_cm / height_cm × 100)
          + (family_history_t2d ? 10 : 0)
          + (gestational_diabetes_history ? 25 : 0)
          + FINDRISC-lite bonus (optional, opt-in):
              low activity   → +5
              diet_score ≤ 2 → +3
              bp_medication  → +5

tier:  < 80 → low   |   80–89 → moderate   |   ≥ 90 → high
```

The Vercel AI SDK (`ai` package) is scoped to two narrow, template-driven jobs
— turning a fixed tier into plain-language copy, and drafting reminder text —
and is never given a score to interpret or asked to produce a tier. That
boundary is enforced by construction: nothing in `lib/scoring/` imports `ai`,
and nothing that imports `ai` writes to `risk_scores`.

### 5.2 The referral state machine

The patient never sees "flagged" or "physician_confirmed" — a referral is
created by the server already carrying its lab assignment, immediately after
a high-risk score, so the first state a family ever sees is "request sent".
`lib/referral/stateMachine.ts` defines the only legal transitions and which
role may trigger each one:

```
request_sent ──► analyzing ──► results_ready
      ▲                             (lab role ONLY, never automated)
      └──────── no_show ◄───────────┘
       (household reschedules)   (lab marks a missed visit)
```

This is checked twice, deliberately: once in `lib/referral/stateMachine.ts`
before any application write, and again at the database level via the RLS
policies on `referrals`/`appointments` in
`006_medical_labs_referral_flow.sql` — the same belt-and-suspenders principle
as the data firewall.

The lab role lives in `app_metadata` on both sides — the API route reads
`session.user.app_metadata.role`, and RLS reads
`auth.jwt() -> 'app_metadata' ->> 'role'`. Two things this deliberately does
NOT use: `user_metadata`, which any signed-in user can set on themselves via
the client SDK (so it can never be trusted for authorization), and the JWT's
top-level `role` claim, which Supabase always sets to `authenticated` for
every signed-in user regardless of app role (that's the Postgres role, not
ours — a policy keyed on it can never match anyone). `app_metadata` is the
one place that's both present in the JWT by default and writable only via
the service-role admin API. There's intentionally no self-service way to
become lab staff — grant it with:

```
node scripts/grant-lab-role.mjs someone@example.com
```

---

## 6. Consent — three types, never conflated

| Type | Who grants it | When | Data collected |
|---|---|---|---|
| `self` | The adult, about themselves | After they authenticate their own account (invite/accept flow, or as the household owner) | Their own screening inputs |
| `guardian` | The household owner, as legal guardian | When adding a minor | Name, relation, DOB only — **no personal health data for minors** |
| `surface_family_history` | The index adult, about a relative | As a categorical input on their own DIABSCORE form (`family_history_t2d`) | A single yes/no flag, not a record about the relative |

All three are written to the append-only `consents` table with a `consent_type`
and `granted_at`, independent of whether a screening was ever completed. The
adult-invite flow (`app/(onboarding)/onboarding/invite` →
`app/(onboarding)/onboarding/accept`) exists specifically so a `self` consent
is never entered by anyone other than the person it belongs to — the household
owner can send an invite, but only the invitee's own authenticated session can
write their own `family_members` row and `self` consent (`app/api/invite/accept/route.ts`
runs under the service role precisely because the owner's session has no RLS
grant to insert a member on someone else's behalf).

---

## 7. Tech stack → responsibility

| Layer | Technology | Used for |
|---|---|---|
| Framework | Next.js 15, App Router | Routing + API routes |
| UI | React 19 + TypeScript (strict) | All components |
| Styling | Tailwind CSS v4 | Muted, non-celebratory palette on risk screens |
| Components | shadcn/ui (RTL-enabled) | Forms, dialogs, sheets |
| Icons | Lucide React | Iconography |
| Scheduling | React Big Calendar | Pharmacy slot picking (partially wired — see gaps) |
| Data fetching | SWR | Installed, not yet wired to the async score-polling flow |
| Motion | Framer Motion | Installed, not yet wired to the score-reveal screen |
| Backend | Next.js API routes | Validation, writes, n8n webhook triggers |
| Database | Supabase Postgres | System of record; RLS is the primary enforcement layer |
| Auth | Supabase Auth | Email OTP; invite-based flow for additional adults |
| Orchestration | n8n | Scoring, referral, reminders — versioned, swappable without redeploy |
| AI | Vercel AI SDK | Template-driven copy only, never scoring |
| i18n | next-intl + `messages/*.json` | Scaffolded; not yet wired into routing |

---

## 8. Companion integration surface — the one deliberate seam

The WHO-grounded lifestyle companion is being built by a separate team. This
repo owns only:
- `components/companion/CompanionPanel.tsx` — the chat UI
- `app/api/companion/message/route.ts` — a stub that returns a placeholder
- `COMPANION_API_CONTRACT.md` — the agreed request/response shape

No prompting, knowledge base, or model logic for the companion lives here by
design. When the other team's service is ready, only the stub's fetch target
changes.

---

## 9. Environment variables

See `.env.example` for the full list. In short:

```
NEXT_PUBLIC_SUPABASE_URL          # from `supabase start` (local) or project settings
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         # server-only — used for invite-accept and n8n writes
NEXT_PUBLIC_SITE_URL              # for building absolute redirect URLs
N8N_WEBHOOK_BASE_URL              # e.g. http://localhost:5678/webhook
COMPANION_SERVICE_URL             # unset = stub response
```

---

## 10. Quick start

### Prerequisites
- Node.js 24+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (already a local devDependency — use `npx supabase`)
- Docker (for `supabase start`) — the account running Docker needs to actually
  be in the `docker` group, or commands need `sudo`

### Setup

```bash
npm install
cp .env.example .env.local        # then fill in values from `supabase start`

npx supabase start                # boots local Postgres, Auth, Studio, etc.
npx supabase migration up         # applies 001 → 004 in order

npm run dev                       # http://localhost:3000
```

### n8n (optional for local demo)

Import the JSON files from `n8n-workflows/` into an n8n instance. Without n8n
running, `POST /api/scoring-webhook` can be called directly for synchronous
scoring — the Next.js route contains the same formula.

---

## 11. Testing

```bash
npm run test           # vitest run — all lib/**/*.test.ts
npm run test:scoring   # just the DIABSCORE suite
npm run test:watch
npm run typecheck      # tsc --noEmit
npm run build          # next build (also runs TypeScript checking)
```

The scoring suite (`lib/scoring/diabscore.test.ts`) is the one test file that
should never regress: it covers every tier boundary (79/80, 89/90) from
multiple directions, each individual factor's contribution in isolation, and
several cross-factor boundary crossings (e.g. family history alone tipping 80
into the high tier).

### Manually verifying the data firewall

```sql
SET ROLE payer_readonly;
SELECT * FROM risk_scores;          -- must fail: permission denied
SELECT * FROM aggregate_outcomes;   -- must succeed
```
(See §4 for why this currently proves the *database* is correctly locked down,
but doesn't yet prove the *running dashboard* uses this role.)

---

## 12. Known gaps (tracked, not hidden)

Kept here deliberately so anyone picking up a module can see what's actually
done versus what's demo-shaped:

1. ~~Payer dashboard doesn't authenticate as `payer_readonly` yet.~~ Removed —
   the CNAM/insurer dashboard has been dropped from the frontend for now; the
   data-firewall database objects (§4) remain in place for when it returns.
2. ~~Pharmacist gating relies on self-editable `user_metadata`.~~ Fixed —
   the role now lives in `app_metadata` on both sides (§5.2).
3. ~~Non-owner household members can't navigate the app.~~ Fixed —
   `lib/household.ts#getMyHousehold` resolves owner-or-member on every page
   and route that used to filter on `owner_user_id` alone; RLS on
   `households`/`family_members` was extended to match
   (`005_household_membership_access.sql`).
4. ~~Booking a slot doesn't create an `appointments` row.~~ Changed —
   a referral is now created with its appointment already attached (nearest
   lab in the household's region, next business day) the moment a high-risk
   score is computed; `/referral/[id]/book` reschedules that appointment
   rather than creating the first one.
5. `swr`, `framer-motion`, and `next-intl` are installed but not yet wired in
   (no live polling for the async score — no longer needed, scoring is now
   synchronous; no reveal animation; no locale switching beyond the
   `messages/*.json` dictionaries, which are themselves stale post-rename).
6. `CompanionPanel.tsx` sends `{ message }` only; `COMPANION_API_CONTRACT.md`
   specifies `{ message, household_id, locale }`.
7. **Scoring no longer depends on n8n** — `/api/screening` computes the
   DIABSCORE result and auto-creates the lab referral inline
   (`app/api/screening/route.ts`), using the same formula the n8n workflows
   in `n8n-workflows/` implement. Those workflows still exist as optional
   reference automation (e.g. if scoring should later move to a separate
   service) but nothing in the app depends on them running.
8. **Lab matching is by exact governorate/region only** — there's no
   geocoding in the schema, so "closest lab" means "first active
   `partner_labs` row in the same region as the household," not a real
   distance calculation.
