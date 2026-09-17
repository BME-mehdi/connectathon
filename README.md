# T2D Family Risk Screening Platform

**Challenge 1.2 — Future Health Connectathon 2026, Tunisia**

A modular, clinical-grade web app for family-based Type 2 diabetes risk screening
and referral. Each consenting adult in a household completes a short, clinically
validated questionnaire (DIABSCORE); anyone flagged high-risk is automatically
routed to a confirmatory blood test at a partner medical lab.

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
                    │  + API routes (validation, writes, scoring,  │
                    │    lab assignment)                            │
                    └───────────────┬───────────────────┬─────────┘
                                    │                     │
                     reads/writes,  │                     │ optional,
                     RLS-enforced   ▼                     ▼ not depended on
                    ┌───────────────────────┐   ┌─────────────────────┐
                    │  Supabase Postgres     │   │  n8n (optional)     │
                    │  - system of record    │◄──┤  - reference copy of│
                    │  - RLS + payer_readonly│   │    the scoring/     │
                    │    role (data firewall)│   │    referral logic   │
                    └───────────────────────┘   │  - reminders (cron) │
                                                 └─────────────────────┘
```

- **Next.js** owns everything user-facing and every write path, *including*
  computing the risk score and auto-creating the lab referral
  (`app/api/screening/route.ts`) — this used to be n8n's job exclusively,
  which meant the whole product stopped working the moment n8n wasn't
  running. Scoring is a pure, deterministic function either way
  (`lib/scoring/diabscore.ts`), so moving where it's *called from* doesn't
  change what it does.
- **Supabase Postgres** is the single system of record. Row-Level Security
  (RLS) is the *primary* enforcement mechanism for household isolation and for
  the payer data firewall — not a convention layered on top of app code.
- **n8n** now holds an *optional* reference copy of the scoring/referral
  logic and the reminder cron — useful if that orchestration ever needs to
  move to a separate service, but nothing in the app depends on it running.
  Versioned JSON, checked into `n8n-workflows/`.

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
                    computeDiabscore() called inline (deterministic, versioned)
                              ▼
                    risk_scores row written (formula_version stamped)
                              │
                    tier === 'high'?
                              ▼
                    nearest active partner_labs row in the household's region
                              │
                    referrals row created (status: request_sent)
                    + appointments row created (next business day, that lab)
                              │
                    patient can change the slot while still request_sent
                    (PATCH /api/referral)  →  updates appointments.scheduled_at
                              │
                    lab marks the visit attended → status: analyzing
                    (or missed → status: no_show → household re-requests)
                              │
                    lab attaches a result → status: results_ready
                    (result_tier + result_summary on the referrals row)
                              │
                    nightly job refreshes aggregate_outcomes (materialized view) —
                    kept up to date for when a payer-facing consumer returns;
                    nothing in the app reads it today (§12)
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
| **Onboarding & consent** | `app/(onboarding)/`, `app/(auth)/`, `app/auth/`, `app/api/households`, `app/api/invite/*`, `app/api/members` | Household creation, adult invite + self-consent, guardian-added minors, the family tree | Layered consent (self / guardian / surface-level) must never be conflated |
| **Screening & scoring** | `app/(screening)/`, `app/api/screening`, `app/api/scoring-webhook`, `lib/scoring/`, `lib/validation/screening.ts` | The DIABSCORE questionnaire, non-diagnostic result display, per-member evaluation history, and — since scoring is now computed inline — the auto lab-referral that follows a high-risk score | **Deterministic, versioned scoring** — never an LLM |
| **Referral & scheduling** | `app/(referral)/`, `app/api/referral/*`, `lib/referral/`, `components/referral/`, `n8n-workflows/referral-workflow.json` (optional), `n8n-workflows/reminder-workflow.json` (optional) | Lab assignment, appointment scheduling/reschedule, lab attendance marking, lab result entry | `results_ready` is lab-only, never automated |
| **Companion (stub)** | `app/api/companion/`, `components/companion/`, `COMPANION_API_CONTRACT.md` | The integration seam only — no prompting/model logic lives here | Never receives individual scores or clinical data |
| **Shared foundation** | `lib/supabase/`, `lib/validation/`, `lib/household.ts`, `components/ui/`, `supabase/migrations/` | Auth clients, household resolution (owner-or-member), Zod schemas used by 2+ modules, shadcn primitives, schema + RLS | Both non-negotiables are ultimately enforced here |

> The CNAM/insurer payer dashboard (`app/(dashboard-payer)/`) has been removed
> from the frontend for now — see §12. The data-firewall database objects
> (`payer_readonly` role, `aggregate_outcomes` view) remain in place for when
> it returns.

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
│   ├── page.tsx                        # Entry: create household or resume (owner OR member)
│   ├── create/                         # Household name + governorate
│   ├── members/                        # List members, family tree; add-minor / invite-adult CTAs
│   │   └── add/                        # Add a minor (name, relation, DOB, contact email —
│   │                                   # no health data collected for them)
│   ├── invite/                         # Any adult already in the household invites another
│   └── accept/                         # Invitee authenticates, enters THEIR OWN data,
│                                        # grants self-consent — never done on their behalf
├── (screening)/screening/
│   ├── page.tsx                        # Member picker (adults only — DIABSCORE needs age 18+)
│   └── [memberId]/
│       ├── page.tsx                    # DIABSCORE + optional FINDRISC-lite form
│       ├── result/                     # Non-diagnostic score display
│       └── history/                    # Every past score for this member + referral status
├── (referral)/referral/
│   ├── page.tsx                        # Patient's own referrals
│   ├── [referralId]/
│   │   ├── page.tsx                    # Referral detail, progress steps, result once ready
│   │   └── book/                       # Pick/change the lab appointment slot
│   └── lab/                            # Lab queue — the only place that can mark a visit
│                                        # attended/missed or attach a result
├── page.tsx                            # Redirects to /auth/login or /onboarding
└── api/
    ├── households/                     # POST create household
    ├── invite/                         # POST send adult invite
    │   └── accept/                     # POST finalize joining (service-role, invite-gated)
    ├── members/                        # POST/GET add & list family members
    ├── screening/                      # POST intake → computes the score inline, auto-creates
    │                                   # the lab referral + appointment if high-risk
    ├── scoring-webhook/                # Secondary, secret-gated scoring entry point for
    │                                   # external callers (e.g. the optional n8n workflows)
    ├── referral/                       # PATCH: status transitions (state-machine + RLS
    │                                   # gated) AND reschedules, in one endpoint
    └── companion/message/              # Stub — see COMPANION_API_CONTRACT.md

components/
├── ui/                                 # shadcn/ui primitives (RTL-enabled for Arabic)
├── family/FamilyTree.tsx               # Renders the household as a simple generational tree
├── referral/LabActions.tsx             # Lab-side "mark attended/missed" + "enter result" forms
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
│   ├── stateMachine.ts                 # Allowed transitions + which role may trigger each
│   ├── labels.ts                       # Shared FR status/result labels (referral pages + history)
│   └── scheduling.ts                   # Default appointment slot (next business day, 09:00)
├── household.ts                        # Resolves "my household" whether owned or joined
└── supabase/
    ├── client.ts                       # Browser client (anon key)
    ├── server.ts                       # Server client (cookie session) + service-role client
    └── middleware.ts                   # Session refresh + route protection (API routes excluded —
                                         # they carry their own auth, see §5.2)

supabase/
├── config.toml                         # Local Supabase CLI project config
└── migrations/
    ├── 001_initial_schema.sql          # All tables + aggregate_outcomes view
    ├── 002_rls_policies.sql            # Household-scoped RLS (original pharmacist policies)
    ├── 003_data_firewall.sql           # payer_readonly role: GRANT view, REVOKE tables
    ├── 004_seed_pharmacies.sql         # Demo partner labs (one per governorate)
    ├── 005_household_membership_access.sql  # Owner-or-member household access; family_members.email
    └── 006_medical_labs_referral_flow.sql   # pharmacy→lab rename; new referral status flow + RLS

n8n-workflows/                          # Optional reference automation — not depended on by the
│                                        # app (§1); field names kept in sync with the schema
├── scoring-workflow.json               # Mirrors lib/scoring/diabscore.ts exactly
├── referral-workflow.json              # High-risk → lab assignment → referral row
└── reminder-workflow.json              # Daily cron: upcoming/overdue notifications (stub)

scripts/
└── grant-lab-role.mjs                  # Grants/revokes the lab role (app_metadata) by email —
                                         # deliberately not self-service, see §5.2

messages/                               # i18n scaffolding (next-intl not yet wired to routing —
│                                        # see §12)
├── fr.json                             # The language the demo ships in
└── ar.json                             # Skeleton — RTL is already on at the shadcn/Tailwind level

COMPANION_API_CONTRACT.md               # Request/response contract for the external team
.env.example                            # All required env vars, documented
vitest.config.ts                        # Test runner config (lib/**/*.test.ts)
```

---

## 4. Data model & the technical data firewall

All tables originate in `supabase/migrations/001_initial_schema.sql`; the
pharmacy→lab rename and new referral status columns land in
`006_medical_labs_referral_flow.sql`. Current shape:

| Table | Purpose | Access |
|---|---|---|
| `households` | Owner + governorate | Owner or member (§12 fix) |
| `family_members` | One row per person (adult or minor); `user_id` is null for minors; `email` is a contact address for everyone, including minors (guardian-managed) | Household-scoped RLS — any adult in the household, not just the owner, can insert/update |
| `consents` | Append-only. `consent_type`: `self` \| `guardian` \| `surface_family_history` | Insert-only RLS, no update/delete policy exists |
| `screening_responses` | DIABSCORE inputs + optional FINDRISC-lite fields | Household-scoped RLS |
| `risk_scores` | `score_value`, `tier`, `formula_version` — one row per computed score, never overwritten | Household-scoped RLS; no client INSERT policy (only the service-role scoring path writes) |
| `partner_labs` | Public metadata (name, region, address, phone) | Public read |
| `referrals` | State machine: `request_sent → analyzing → results_ready`, with `no_show → request_sent` as the reschedule loop (§5.2). Also carries `lab_id`, `result_tier`, `result_summary`, `results_entered_at` | Household-scoped read/limited update; lab-scoped read/update |
| `appointments` | Booked slot (`scheduled_at`) + `attended_at` (set when the lab confirms the visit happened) | Household-scoped (read always; update only while `request_sent`) + lab RLS |
| `audit_log` | Append-only action trail (consent grants, referral transitions, reschedules) | Insert-only |
| `aggregate_outcomes` | Materialized view: region × month → cohort size, % high-risk, % referral completed, % confirmed prediabetes. **Zero individual identifiers.** Kept up to date; no payer-facing page reads it today (§12) | `payer_readonly` role only |

### The firewall, concretely

`supabase/migrations/003_data_firewall.sql` creates a dedicated `payer_readonly`
Postgres role: `GRANT SELECT` on `aggregate_outcomes` only, `REVOKE ALL` on
every individual table. This is meant to be a second, independent layer under
the RLS policies in `002_rls_policies.sql`/`006_medical_labs_referral_flow.sql`
— so that even a bug in a future payer-facing dashboard, or a missed RLS
policy somewhere, still can't leak an individual record, because the *role*
itself has no grant to leak. There is currently no page that authenticates as
`payer_readonly` — the payer dashboard was removed from the frontend (§12) —
so treat this as infrastructure held ready for when that surface returns,
not something to verify against a running page today.

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
| Scheduling | React Big Calendar | Installed; the current slot picker (`/referral/[id]/book`) is a hand-rolled grid, not yet using it |
| Data fetching | SWR | Installed, not currently needed — scoring is synchronous now, no async polling |
| Motion | Framer Motion | Installed, not yet wired to the score-reveal screen |
| Backend | Next.js API routes | Validation, writes, scoring, lab assignment |
| Database | Supabase Postgres | System of record; RLS is the primary enforcement layer |
| Auth | Supabase Auth | Email OTP; invite-based flow for additional adults |
| Orchestration | n8n (optional) | Reference copy of scoring/referral logic + reminders — not depended on by the app |
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
N8N_WEBHOOK_BASE_URL              # e.g. http://localhost:5678/webhook — optional, see §10
SCORING_WEBHOOK_SECRET            # required header value for POST /api/scoring-webhook
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
cp .env.example .env.local        # then fill in values from `supabase start`,
                                   # plus a value for SCORING_WEBHOOK_SECRET
                                   # (only needed if you'll call /api/scoring-webhook)

npx supabase start                # boots local Postgres, Auth, Studio, etc.
npx supabase migration up         # applies 001 → 006 in order

npm run dev                       # http://localhost:3000
```

Scoring and lab-referral creation happen inline in `/api/screening` — no
extra service needs to be running for the core loop (fill intake → see a
score → high-risk gets routed to a lab) to work end to end.

### Granting the lab role

There's no sign-up path for lab staff — the role is admin-granted, on
purpose (§5.2):

```bash
node scripts/grant-lab-role.mjs someone@example.com
```

They need to sign out and back in afterwards for the role to land in their
session, then `/referral/lab` becomes reachable for that account.

### n8n (optional)

Import the JSON files from `n8n-workflows/` into an n8n instance if you want
this orchestration to live outside the app (e.g. ahead of moving it to a
separate service later). `POST /api/scoring-webhook` is the entry point n8n
(or any other trusted external caller) would hit — it requires an
`x-webhook-secret` header matching `SCORING_WEBHOOK_SECRET`, and uses the
service-role client since it's meant to be called without a user session.

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
(See §4 — this proves the *database* is correctly locked down; there is
currently no page that authenticates as this role, since the payer dashboard
was removed from the frontend, §12.)

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
   synchronous; no reveal animation; no locale switching — `messages/fr.json`
   is kept current by hand, `messages/ar.json` is still a skeleton).
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
