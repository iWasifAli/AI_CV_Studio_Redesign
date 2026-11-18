# Workspace Tabs Implementation Plan

> **For agentic workers:** Use the approved design and the task interfaces below. Execute with test-first checks and independent review; user already authorized implementation.

**Goal:** Persistent independent application workspaces with safe background operations.
**Architecture:** A root workspace store owns tab-scoped feature snapshots and tasks. Native routes render one active tab; IndexedDB restores sessions. Atomic backend contracts protect side effects.
**Tech Stack:** Existing Next/React/TypeScript, IndexedDB, Vitest, Playwright, Firestore.
**Spec:** ../specs/2026-11-18-workspace-tabs-design.md

## Global constraints

Preserve guest behavior, existing URLs and entity ownership. No new dependencies unless essential. No external publication. Work on current feature branch; parallel workers use separate checkouts. Existing backend models remain readable. New snapshot serialization must preserve File/Blob and support typed feature state. No passwords/credentials in workspace state.

## Review focus

- Same-route tabs must not reuse hooks/initial entity state.
- Navigation and late requests must preserve original ownership.
- Restored stale drafts must not overwrite canonical records.
- Quota/corruption/reload must not silently lose drafts or replay side effects.
- Signout/account replacement must fence all writers, including other windows.

## Task 1: Workspace model and durable controller (main)

Files: src/features/workspace/{model,routes,storage,store}.ts and *.test.ts.
Interfaces: WorkspaceSession/WorkspaceTab; WorkspaceStore; snapshot feature keys; task controller. State setter accepts React SetStateAction; snapshots store structured-cloneable values. Tab identity in _workspace query; canonical entity identity independent of query.
- [x] Write and run failing route/reducer/storage/task behavior tests.
- [x] Implement state/controller/IndexedDB with version validation, scoped ownership, file persistence, closed-tab history, task lifetime and 250ms saves.
- [x] Run targeted tests; inspect results.

## Task 2: React provider/navigation/tab UI (main)

Files: src/features/workspace/{context,navigation,tab-bar}.tsx, root/site/studio layouts and shared navigation components.
Interfaces for adapters: useWorkspaceState<T>(key:string, initial:T|(()=>T), options?:{dirty?:boolean}):[T,Dispatch<SetStateAction<T>>]; useWorkspaceRouter() preserves native API with bound origin; useWorkspaceTask() returns runner retaining origin store; useWorkspace() exposes store/tab/owner. All hooks fall back to existing local behavior outside enabled signed-in workspace.
- [x] Add failing browser coverage for tab create/switch/close/restore/same-route forms.
- [x] Implement hydration boundary, route synchronization, accessible strip, global route exclusions, rollout flag.
- [x] Integrate document history, loaders, local creation idempotence and scroll restoration.

## Task 3: Backend reliability (isolated backend worker)

Files: store types/memory/firestore; job/letter/coach schemas and API routes; identity assertion helper; backend tests.
Interfaces: Idempotency-Key on POST jobs/letters, optional expectedRevision on mutation bodies, revision on stored/read resources, 409 details with current/generated; X-Workspace-Owner assertion. Existing request callers remain compatible.
- [x] Add failing idempotency/conditional commit/revocation tests.
- [x] Implement transactional create receipts, resource revisions and all writer updates, nullable Coach revision envelope, stale generated result preservation and quota release.
- [x] Run tests/typecheck; return patch and evidence, no shared-tree writes.

## Task 4: Feature adapters (isolated workers after Task 2 contracts)

Files: features editor/guided/download/makeover/import, jobs/letters, gallery/portfolio/linkedin/coach/skills/stories/presence and existing scoped draft modules.
- [x] Preserve meaningful UI/drafts in useWorkspaceState with stable explicit feature/entity keys, excluding busy/errors/server snapshots.
- [x] Move long-running operations to shared task lifetime, protect generated result revisions, bind navigation; scope caches and original files.
- [x] Add feature restore and background regression coverage and run targeted checks.

## Task 5: Account lifecycle and cross-window loss protection (main)

Files: account context/sync and workspace lifecycle/recovery.
- [x] Add failing tests for failed sync, late results, owner replacement, cross-window preparation and missing acknowledgements.
- [x] Add pre-signout participants, owner-fenced writes, BroadcastChannel preparation, recovery ZIP, explicit discard flow.
- [x] Preserve one-click clean signout and guest fallback.

## Task 6: Integration, verification and independent review (main + read-only reviewer)

- [x] Integrate worker patches with review; run focused checks before full gates.
- [x] npm run verify; npm run test:store; npm run test:e2e with WORKSPACE_TABS_ENABLED=1 and disabled regression.
- [x] Inspect desktop/mobile screenshots; fix real failures with regression tests.
- [x] Independent scope/correctness review; resolve material findings and rerun affected checks.
- [x] Update implementation ledger and user-facing engineering documentation with observed results and limitations.

Validation results and rollout instructions: `docs/engineering/deployment.md`, Internal workspace tabs rollout.
