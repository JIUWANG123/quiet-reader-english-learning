# Reader startup and crash diagnostics implementation plan

**Goal:** Stable current layout, serialized previews, recoverable hidden failures and evidence-based Android diagnostics.
**Architecture:** Retain the three WebViews and UI-thread page stack. Add a layout epoch barrier, one hidden-navigation scheduler, and durable sanitized session/process diagnostics.
**Tech Stack:** Expo 57, React Native 0.86, WebView 13.16.1, epub.js, TypeScript, Android.
**Spec:** ../specs/2026-09-26-reader-stability.md
**Execution:** subagent-driven-development for independent bounded modules; root owns integration and Android acceptance.

## Constraints
- Version remains 1.11.2 / 45 development; no crash root cause claim without evidence.
- Preserve CFI, visual anchors, UI-thread readiness, pageKey, revision, annotations, translation, progress journal and last-write-wins.
- No content, CFI, book title, real path or secret in diagnostics; 500-row ring.
- No parallel hidden navigation/rebuild, soft 1800ms only reports, hard watchdog 8000ms without progress, retries 500/1500ms then stop.

## Task 1: Layout protocol
Files: epubParagraphBridge.ts, new epubPaint.ts, layout integration tests.
- [ ] Reproduce page-painted preceding pending relayout using real paragraph bridge.
- [ ] Add epoch and cancellable whenLayoutStable with independent watchdog and valid location verification.
- [ ] Export paint script awaiting stable epoch plus two RAF, rejecting stale revision.
- [ ] Verify disabled/no mutation fast path, epoch supersession, cancellation and real EPUB.

## Task 2: Native diagnostics and runtime lifecycle
Files: diagnostics.ts, native module/config plugin, useEpubFileSystem.ts, epubResources.ts, app startup hook; corresponding tests.
- [ ] Tests before implementation for privacy/ring, safe token cleanup, exit reason mapping and session journal.
- [ ] ApplicationExitInfo API 30+, renderer callback forwarding if required, bounded diagnostics and lifecycle helper.
- [ ] Stale-only runtime cleanup and numerical resource preparation metrics; preserve complete cache.
- [ ] Verify idempotent native generation and module build; expose root integration APIs.

## Task 3: Preview scheduler and integration
Files: epubPool.ts, epubPreviewBoot.ts, EpubReader.tsx, IsolatedEpubPage.tsx, preview watchdog and tests.
- [ ] Demonstrate existing simultaneous creation and hard cutoff with failing tests.
- [ ] Current first, next then previous, explicit origins and one hidden job, direction priority.
- [ ] Stage progress watchdog; finite delayed retry, hidden errors isolated, renderer recovery from committed CFI.
- [ ] Integrate layout barrier, sanitized invalidation reasons, app background pause and hidden release.
- [ ] Run TypeScript, unit and real EPUB tests.

## Task 4: Native acceptance and review
- [ ] Baseline old APK on existing Android API36 AVD with same fixture.
- [ ] Build development APK, verify native callbacks/module and install.
- [ ] 20 cold starts, 100 forward turns, 50 alternating turns, 10 layout cycles, 10 background cycles.
- [ ] Collect stage counts, latency percentiles and PSS/RSS snapshots; fault-inject renderer if supported.
- [ ] Review diff, address defects, document five requested report sections and explicit unverified risks.

## Ledger
- Base: 4ef64f0. Clean branch codex/reader-startup-diagnostics; existing native build environment retained to avoid path-dependent rebuild disruption.
- Interfaces: layout worker owns bridge/paint only; diagnostics worker owns diagnostics/native/runtime/resources only; root owns reader/pool/navigation integration. Native acceptance helper owns scripts only.
- Ruling: user supplied complete design and authorization; proceed without duplicate design approval.
