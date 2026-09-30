# 生词频率筛选与高频优先学习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在不改变已有复习规则的前提下，增加生词频率筛选、筛选持久化、高频优先学习和英选中默认题型。

**Architecture:** 使用现有 vocabulary.lookup_count；review.ts 统一负责频率筛选和学习排序；收藏筛选保存到 settings，study_plan 扩展排序字段，页面复用现有组件。

**Tech Stack:** Expo 57, React Native, TypeScript, expo-sqlite, Node test runner

**Spec:** docs/superpowers/specs/2026-10-01-vocabulary-frequency-study-design.md

## Global Constraints

- 频率只使用 lookup_count，不扫描正文。
- 高频排序不改变 due/new 分类和每日额度。
- 旧设置缺少新增字段时回退默认值。
- 完成前必须通过 typecheck、完整测试和 Android Release 构建。

---

### Task 1: 频率模型与队列排序

**Files:** src/services/vocabulary/review.ts, src/services/vocabulary/lexicon.ts, tests/study-review.test.ts, tests/study-lexicon.test.ts

- [ ] Write failing tests for frequency filters, legacy plan normalization, and frequency-first review/new ordering.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement the model, SQL predicates, and stable queue sorting.
- [ ] Run targeted tests and confirm pass.
- [ ] Commit model and queue changes.

### Task 2: 收藏筛选 UI 与持久化

**Files:** src/features/vocabulary/WordFilters.tsx, src/features/vocabulary/VocabularyScreen.tsx, tests/vocabulary-filters.test.ts

- [ ] Write failing tests for four frequency choices, reset, and legacy JSON fallback.
- [ ] Implement frequency controls, settings persistence, pagination, and export integration.
- [ ] Run tests and typecheck.
- [ ] Commit UI and persistence changes.

### Task 3: 背词设置与默认英选中

**Files:** src/features/vocabulary/StudyLimits.tsx, src/app/study.tsx, tests/study-screen-options.test.ts

- [ ] Write failing tests for plan order persistence and missing study_mode defaulting to choice.
- [ ] Implement order controls and preserve saved modes.
- [ ] Run targeted tests and commit.

### Task 4: 开发便签、版本与集成检查

**Files:** DEVELOPMENT_STATUS.md, package.json, package-lock.json, app.json, .github/workflows/android-apk.yml

- [ ] Append implementation status and acceptance results.
- [ ] Bump version to 1.11.5/versionCode 48.
- [ ] Run generation check, typecheck, and full tests.
- [ ] Commit and push master.

### Task 5: Android Release APK

**Files:** QuietReader-1.11.5-frequency-study-arm64-20261001.apk

- [ ] Wait for GitHub Actions, download and verify manifest, arm64 library, bundle, v2 signature, and certificate continuity.
- [ ] Create v1.11.5 Release and append final link/hash to DEVELOPMENT_STATUS.md.
- [ ] Commit and push final development note.
