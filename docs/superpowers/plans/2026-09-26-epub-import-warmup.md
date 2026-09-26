# EPUB Import-Time Pagination Warmup Implementation Plan

> **For agentic workers:** use the existing stability branch and preserve the three-WebView reader architecture.

**Goal:** Reduce first-page-turn blocking by preparing reusable EPUB resources and a settings-aware warmup cache immediately after import.

**Architecture:** Import keeps the original EPUB and creates a validated resource/index cache. A background warmup service opens a lightweight headless epub.js worker for the imported book, computes the CFI location index and nearby page anchors for the default reading settings, then stores only reusable metadata. EpubReader consumes matching warmup metadata as initial locations/visual anchors and still owns the live three-page WebViews and NativePageStack animation.

**Tech Stack:** Expo 57, TypeScript, expo-file-system, JSZip, epub.js through @epubjs-react-native/core, existing SQLite book records, Android APK build.

**Baseline:** branch `codex/reader-startup-diagnostics`, version 1.11.2 development, commits `52581cb` and `51354cb`; current regression suite 107 tests passing.

## Constraints

- Do not replace the three-page WebView/NativePageStack design.
- Do not cache rendered animation frames as permanent page content.
- Cache keys include EPUB fingerprint, viewport, font size, line height, margin, theme, paragraph translation visibility, and reader mode.
- Invalid or stale caches are ignored and rebuilt.
- Import must remain usable if warmup fails; warmup is cancellable and bounded.
- Never overwrite committed CFI/progress with an unknown or first-page fallback.
- Keep version 1.11.2 development until Android evidence is collected.

## Task 1: Cache model and tests

**Files:** `src/features/reader/warmupCache.ts`, `tests/warmup-cache.test.ts`.

- Define `WarmupSettings`, `WarmupKey`, `WarmupSnapshot`, and `WarmupStatus`.
- Store only numeric metadata, CFI strings, section indexes, and visual anchor numbers; do not store book text.
- Add atomic marker writes and fingerprint validation.
- Tests cover cache hit, settings mismatch, source replacement, interrupted write, malformed data, and bounded size.

## Task 2: Import-time resource and location warmup

**Files:** `src/services/books/import.ts`, `src/features/reader/epubResources.ts`, `src/services/books/warmup.ts`, `tests/book-warmup.test.ts`.

- After EPUB copy succeeds, start a cancellable warmup job.
- Reuse `prepareEpubResources` and existing location cache; never unzip a complete cache again.
- Generate or reuse the CFI location index.
- Record status and metrics in diagnostics, but do not block the import transaction or book display.
- Limit concurrency to one warmup job and expose cancellation on app background.

## Task 3: Reader consumption and first-turn readiness

**Files:** `src/features/reader/EpubReader.tsx`, `src/features/reader/IsolatedEpubPage.tsx`, `src/features/reader/epubPool.ts`, `src/features/reader/epubVisualPosition.ts`, integration scripts/tests.

- Build the same settings key used by warmup.
- Pass matching cached locations to current and neighbor readers.
- Use cached next/previous anchors only when the saved CFI and layout key match.
- Keep final `qr-page-painted` and UI-thread readiness as the authoritative gate.
- Do not make a stale warmup cache unlock a swipe.
- Add a deterministic test proving a warmup hit avoids initial location generation and a mismatch falls back safely.

## Task 4: Android validation and APK

- Run TypeScript, full unit tests, warmup tests, and real EPUB browser tests.
- Build version 1.11.2 development APK with the existing native diagnostics module.
- Install on API 36 emulator/device when available.
- Compare 20 cold opens before/after warmup, measuring current restore, next ready, first successful turn, PREVIEW_PENDING, PREVIEW_SLOW, PREVIEW_TIMEOUT, and neighbor invalidation.
- Sample PSS/RSS at current-only, next-warm, and full three-page states.
- Produce the APK and report remaining risks; do not claim crash root cause without a real process event.

## Acceptance

The APK is deliverable when the warmup cache is validated, all automated tests pass, the app still opens books without warmup, the first successful turn uses the existing NativePageStack readiness path, and the Android build is signed and inspectable.
