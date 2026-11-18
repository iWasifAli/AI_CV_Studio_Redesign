# Deployment

## Environments

| Env | Trigger | Purpose |
|---|---|---|
| Local | `npm run dev` | Development; AI uses `mock` provider unless a key is set; PDF uses local Chrome (`CHROME_EXECUTABLE_PATH` or auto-detect) |
| Preview | Every PR | Per-branch URL for review and e2e against a deployed build |
| Production | Merge to `main` (after CI) | Public site |

## Hosting choice (ADR-0004)

**Primary: Vercel** (Node.js runtime functions). Next.js is first-class there; preview deployments per PR come free.
- PDF function uses `@sparticuz/chromium` (+ `puppeteer-core`), memory 1769 MB, max duration 30 s.
- AI routes: Node runtime, 60 s max duration (20 s per model call, one retry). Set `GEMINI_API_KEY` as a server-only secret on a billing-enabled Google Cloud project.

**Portable alternative: Docker** (`Dockerfile` with Next.js standalone output + Debian Chromium) for Fly.io/Render/any VM. Kept working in CI by building the image, so we are never locked in. If PDF cold starts or bundle limits become a problem on Vercel, the PDF route moves to a small container service behind the same `/api/pdf` contract.

## CI/CD (GitHub Actions)

`ci.yml` on every push/PR:
1. `npm ci`
2. `npm run lint` · `npm run typecheck` · `npm run format:check`
3. `npm test` (Vitest)
4. `npm run build`
5. `npx playwright install --with-deps chromium` · `npm run test:e2e`
6. Upload Playwright report and visual artifacts

Branch protection on `main`: require CI green and one review (the owner); no force pushes.

## Configuration

See `application-architecture.md#configuration`. Production secrets live in the host's encrypted env store. `.env.example` lists every variable.

## Observability

- Structured JSON logs with request id (no CV content).
- Error tracking (Sentry, with PII scrubbing) from Phase 6 / launch hardening.
- `/api/health` for uptime checks.

## Firebase App Hosting (production, chosen November 2026)

The owner's existing Firebase project `ai-cv-studio` serves `aicvstudio.app`. The new app runs on **Firebase App Hosting** (Next.js on Cloud Run) because PDF creation and AI help need a server; classic Firebase Hosting only serves static files.

- Config: `apphosting.yaml` (2 vCPU, 2 GiB for Chromium, max 4 instances, env vars).
- PDF: `@sparticuz/chromium` (no system Chrome on App Hosting). Kept out of the bundle via `serverExternalPackages`; its binary is traced into the standalone output. Verified: production server with system Chrome hidden returns a 1-page PDF with embedded TrueType fonts.
- Secret: `GEMINI_API_KEY` comes from Cloud Secret Manager secret `GEMINI_API_KEY`; `firebase-app-hosting-compute@ai-cv-studio.iam.gserviceaccount.com` has Secret Accessor on it. Without it AI help is off; everything else works.
- Rollouts: the backend is connected to GitHub `nisar87/AI_CV_Studio_Redesign`, branch `main`; every push to `main` deploys.
- Domain: `aicvstudio.app` moves from the old Hosting site to the App Hosting backend (Firebase console → App Hosting → backend → Settings → Domains); DNS records shown there must be set at the domain registrar.

### Internal workspace tabs rollout

`WORKSPACE_TABS_ENABLED=1` enables persistent internal tabs for signed-in users. It is a server
setting; leave it unset or `0` during the compatibility deployment, then enable it after validation.
Deploy the revision, idempotency, and `X-Workspace-Owner` API guards in the same release before
turning on the UI. Older clients can omit these optional request fields. Returning the flag to `0`
restores ordinary navigation while keeping browser workspace recovery data for a later rollout.

Workspaces and uploaded draft files are stored in IndexedDB on the same browser/device. They are
account scoped and window scoped; they are not cloud synchronization. Saved CVs, jobs, letters,
and other account records remain canonical. A browser restart marks unfinished tasks interrupted
and never repeats AI work automatically. Sign-out checks other windows and offers recovery or an
explicit discard decision when local-only or unverified work remains.

Verify the default navigation suite with `npm run test:e2e`. To exercise the new tabs separately,
run `WORKSPACE_TABS_ENABLED=1 PORT=3101 npm run test:e2e -- e2e/workspace-tabs.spec.ts e2e/pwa.spec.ts --project=desktop --project=mobile`
after a production build. The separate port prevents reuse of a server running with the flag off.
CI runs this enabled suite separately and retains its screenshots and report. `npm run test:store`
includes the revision/idempotency reliability contracts against both memory and Firestore.

Validation on November 19, 2026:

- `npm run verify`: passed lint, TypeScript, formatting, 1,018 unit tests, and production build.
  The unit run skipped 12 emulator-only tests; lint retained eight existing warnings and no errors.
  A final production rebuild also passed after the selected-tab resize adjustment.
- `npm run test:store`: 21 tests passed with the Firestore emulator, including both store backends.
- Enabled tabs: all 38 desktop/mobile workspace and offline scenarios passed. Screenshots of the
  home strip and CV editor were inspected on both sizes; selected tabs remain visible and controls
  remain reachable. Coverage includes keyboard/accessibility, independent drafts and undo histories,
  persisted uploads, late AI results, reload without replay, account replacement and multiwindow sign-out.
- The default-flag regression run passed 711 tests and skipped 445. Two external-link cases and
  the mobile kit download initially failed; their fixes passed all 16 job-link/kit checks on the final
  build. The gallery timing check failed under concurrent build/browser load and passed in isolation
  at 1,195 ms against its 2,000 ms budget. All 39 admin-dependent tests subsequently passed separately.

Browser tests use the deterministic AI mock and Firebase emulators. Production AI providers and
deployment were outside this validation. Draft restoration remains limited to the same browser;
blocked/full browser storage exposes recovery actions instead of claiming durable saves.
