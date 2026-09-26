# RusSilica BI Terminal — Release Manifest

Generated: 2026-09-26T22:47:02.943Z

## A. Repository State

```text
BASE_SHA=0acf5db25e13d91b089fbaae75dafc9e8758f9a2
FINAL_SHA=6d1078a24e338efaec94bfd3ae022215510c9ec3
BRANCH=main
REMOTE_MAIN=0acf5db25e13d91b089fbaae75dafc9e8758f9a2
WORKTREE=DIRTY
```

## B. Automated Gates

| Gate | Result | Ran on |
|---|---|---|
| Tests (vitest) | CHECK (794 tests, 245 files, 0 failures) | LOCAL |
| Lint | PASS | LOCAL |
| Build (type-check + standalone) | PASS | LOCAL |
| Offline Bitrix contract | PASS | LOCAL |
| Live Bitrix contract | SKIPPED — LIVE BITRIX NOT CONFIGURED | SKIPPED |
| Deployment artifact QA | PASS | LOCAL |
| Dependency audit (prod, High/Critical) | PASS (0 high, 0 critical; 2 moderate below gate) | LOCAL |
| Standalone runtime smoke | PASS (12/12) | LOCAL |
| Browser acceptance (unauthenticated) | PASS (5/5) | LOCAL |
| Browser acceptance (authenticated) | NOT EXECUTED — requires external test credential | NOT EXECUTED |
| GitHub Actions exact-SHA gate | pending push | PENDING |

## C. Benchmarks

| Profile | Result | Source |
|---|---|---|
| S (1,000 companies / 3,000 deals) | see qa:benchmark output | LOCAL |
| M (5,000 / 15,000) | see qa:benchmark output | LOCAL |
| L (10,000 / 50,000) | analytics supported/tested; **Profile L full Excel NOT claimed** (browser Excel >20k rows explicitly out of scope) | LOCAL |

Benchmark evidence source is labelled LOCAL — not presented as GitHub Actions evidence.

## D. Production Evidence

```text
Production URL: EXTERNAL DEPLOYMENT REQUIRED
Production build SHA: not yet verifiable
Accepted FINAL_SHA: 6d1078a24e338efaec94bfd3ae022215510c9ec3
Match: NO — EXTERNAL DEPLOYMENT REQUIRED
```

Production verification contract (after external deployment):
1. `GET /api/health` → `buildSha == FINAL_SHA`
2. `/`, `/companies`, `/samples`, `/commercial-funnel` exist (protected pages may redirect; never 404)
3. `/api/bitrix/deals`, `/api/bitrix/companies/list`, `/api/bitrix/samples`, `/api/bitrix/commercial-funnel` → auth boundary (401/403), never 404
4. Login flow works

## E. Remaining External Gates

- EXTERNAL DEPLOYMENT REQUIRED (production deployment is outside the repository; see DEPLOYMENT.md)
- AUTHENTICATED BROWSER ACCEPTANCE REQUIRES EXTERNAL TEST CREDENTIAL
- LIVE BITRIX CONTRACT + SHADOW ACCEPTANCE REQUIRES LIVE BITRIX_WEBHOOK_URL
