# 生词频率筛选与高频优先学习设计

## 目标

基于现有 lookup_count，让生词收藏页支持按查词频率筛选并记住筛选条件；让背词页面支持高频词优先；将没有保存过学习题型的用户默认设置为英选中。

## 已确认定义

出现频率采用当前生词本中的查词/收藏累计次数 lookup_count，不扫描整本书正文。

频率分档：全部、高频（lookup_count >= 5）、中频（2-4）、低频（1）。

## 用户行为

收藏页筛选面板增加出现频率。频率、书籍、熟悉度、到期状态、搜索词和标签页保存到 settings 的 vocabulary_filters 键，重新进入时恢复，重置时恢复默认。

背词页增加学习顺序：默认顺序和高频优先。高频优先只改变同类内部排序：复习词先按 due_at、再按 lookup_count 降序；新词先按 lookup_count 降序、再按 created_at 升序。每日额度和到期规则不变。

没有 study_mode 设置时默认题型为 choice（英选中）；已有设置继续保留。

## 数据与接口

Filters 增加 frequency: all | high | medium | low。Plan 增加 order: default | frequency。旧版设置缺少新字段时分别回退 all 和 default。

## 组件职责

review.ts 负责类型、规范化、筛选和队列排序；lexicon.ts 负责频率 SQL；WordFilters.tsx 负责频率 UI；VocabularyScreen.tsx 负责收藏筛选持久化；StudyLimits.tsx 负责学习顺序 UI；study.tsx 使用排序计划并默认 choice。

## 错误处理与兼容

设置读取失败使用默认值，不清除单词和学习记录。非法频率、排序和数值必须归一化。高频排序不得绕过 due/new 分类和每日额度。

## 验收标准

1. 收藏页可以筛选四档频率，退出后重新进入仍保留。
2. 重置后全部筛选恢复默认。
3. 高频优先分别作用于复习词和新词，且不改变额度和到期规则。
4. 新安装或没有 study_mode 时默认英选中，已有题型不覆盖。
5. 旧版设置和非法字段可安全读取。
6. 类型检查、完整测试、专项测试和 Android Release APK 构建通过。
