# Consumer UX refinement — 2026-10-17

Frontend-only update on the existing Vercel project. Render, Neon, contract deployments, financial authorization, signing payloads, spending budgets and AI APIs are unchanged.

## Product changes

- Inter Tight across body and display typography with `letter-spacing: -0.04em` (−4% of the font size). Monospace addresses and technical values retain normal tracking for accuracy.
- Home prioritizes available test-ETH balance, AI input, payments to review/completed, spending rules, automatic payments and recent activity. Contract limits and shared demo budgets are labeled separately.
- Labeled Home, AI Assistant, Payments, Automations, Security and Settings navigation, with Evidence separate. Existing advanced routes remain reachable through Settings and technical sections.
- Payment review shows the full destination, network, estimated fee, security result, funds source and authorization method before confirmation. Canceling demo review does not send a request. Wallet signatures and exact confirmation payloads are preserved.
- Honest shared-demo custody, invite access, pending/confirmed receipts, and page-driven automation language. No invented fiat conversions or unattended scheduler promises.
- Loading/retry states protect deep links until the selected wallet configuration is available. This also prevents a temporary wrong-wallet dashboard during startup.

## Verification

- Production frontend build passed. Existing main-bundle size warning remains; no new dependency or unrelated bundle refactor was introduced.
- 34 focused component checks passed across consumer UX, existing payment/signature controls, v2 authorization and judge entry.
- Browser checks at 1440, 1024, 768 and 390 pixels: no JavaScript errors or horizontal overflow; real Inter Tight loaded; requested body tracking computed to −0.64px at 16px.
- Local frontend smoke used read-only responses from the existing hosted backend, with a test-only origin bridge. Guest session creation was the only permitted POST. Verified navigation, prefilled AI draft handoff and a real existing Sepolia receipt link. Payment review/confirmation UI used explicit unit-test fixtures.
- No paid AI call, wallet signature, grant, payment, contract deployment or backend deployment was performed for this visual refinement. No backend/blockchain regression suite was run.

Public frontend: https://agentwallet-judge.vercel.app . Existing free hosting and invite/security boundaries remain in force.
