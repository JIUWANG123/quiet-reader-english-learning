# 技术选择

核查日期：2026-09-08。当前范围：PHASE 0 / PHASE 1 / PHASE 2 进行中。

| 模块 | 选择与原因 | License |
| --- | --- | --- |
| App | Expo 57 / React Native 0.86 / React 19 / TypeScript，官方 blank-typescript 创建；依赖按 `expo install` 匹配，锁定 package-lock | MIT；TypeScript Apache-2.0 |
| 导航 | Expo Router，使用 `src/app`，不自建导航 | MIT |
| 数据 | expo-sqlite，异步参数查询、WAL、事务、user_version；用户数据 app.db，后续 dictionary.db 独立 | MIT |
| 导入 | expo-document-picker 系统选择器 + expo-file-system 的 File / Directory API；先复制缓存，再复制到私有目录 | MIT |
| TXT | 原生 ScrollView / Text selectable，SQLite 分段读取；稳定段编号 + 段内滚动比例，排版改变不改变分段 | React Native MIT |
| 标识 | expo-crypto.randomUUID，不用文件名作存储路径 | MIT |
| 排版 | 原生组件、safe-area-context、三主题，避免额外 UI 框架 | MIT |
| 词典 | skywind3000/ECDICT 固定提交 `bc015ed`；构建期将 CSV 与 lemma.en.txt 转为独立只读 SQLite，App 不解析 CSV | MIT |
| 发音 | expo-speech 57，调用设备系统英文 TTS | MIT |

官方依据：[SQLite / 预装数据库](https://docs.expo.dev/versions/latest/sdk/sqlite/)、[with-sqlite 示例](https://github.com/expo/examples/tree/master/with-sqlite)、[文件导入](https://docs.expo.dev/versions/latest/sdk/document-picker/)、[FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)、[Router 安装](https://docs.expo.dev/router/installation/)。

## 后续模块已做初筛，接入前继续核查

- **ECDICT / lemma（PHASE 2）**：[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) 固定提交 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`，仓库 LICENSE 为 MIT。`scripts/build-ecdict.py` 生成 770,611 词条、182,903 词形的 `dictionary.db`；许可原文随资源保留。普通查询只访问 SQLite。
- **EPUB（PHASE 3）**：[epubjs](https://www.npmjs.com/package/epubjs) 0.3.93 的 npm 许可为 BSD-2-Clause，包最后修改于 2023-09；[React Native 封装](https://github.com/victorsoares96/epubjs-react-native) / `@epubjs-react-native/core` 1.4.7 为 MIT，包最后修改于 2025-01。已有 initialLocation / onLocationChange / onSelected / menuItems / annotation / WebView message 接口。查过 README、npm peer dependencies 和 Issues；Issues 创建受限，不能将少量公开问题当作兼容证据。尚未验证 Expo 57，暂不安装。接入时先做本地 EPUB、iframe 选择、CFI 恢复的小样验证；必要时直接 WebView 承载本地 epub.js，禁止依赖 CDN 才能阅读。
- **文本选择与高亮**：优先复用上述封装；TXT 目前使用系统长按选择，仅提供系统菜单。自定义释义工具栏与点词还未实现。
- **发音**：计划 expo-speech（Expo MIT）调用系统 TTS；检查设备是否装有离线英文语音，不使用付费接口。
- **密钥**：PHASE 4 使用 expo-secure-store（Expo MIT），仅用户在设备设置页输入；本阶段没有密钥文件、联网 AI 请求或 AI 设置假功能。
- **MDict（第二阶段）**：[fengdh/mdict-js](https://github.com/fengdh/mdict-js) 为旧实现，未在其仓库页面确认独立根许可，不能直接复制；[terasum/js-mdict](https://github.com/terasum/js-mdict) 较新，但 7.0 起 AGPL-3.0 且偏 Node 环境，暂不依赖。未来仅通过 DictionaryProvider 接入合法用户文件，不能内置商业词库。

## 边界

- 书籍导入上限为 128 MB；TXT 暂支持 UTF-8，导入时临时读取全文，阅读时只取当前约 3500 字符的段。分段不会丢失字符，目录是分段列表与可识别段首标题，并非完整 TXT 章节解析器。大型 EPUB 仅复制文件，不解析正文。
- EPUB 当前只导入保存；封面、元数据、渲染按 PHASE 3 实现。
- Router 的自动 peer resolution 一度选中不匹配的 react-dom / worklets；现使用与 SDK 对应的 react-dom 19.2.3、worklets 0.10.1、reanimated 4.5.1，`expo install --check` 已通过。
- `npm audit` 报告 13 个 moderate、0 high、0 critical，主要链路为 Expo 构建工具的 xcode/uuid 和 Router 的 query-string/decode-uri-component。未使用 `audit fix --force` 强制降级 Expo。发布前复查上游修复；目前未引入自定义依赖覆盖。
# EPUB reader

- Windows 构建 SDK 本地副本的 Ninja 升至官方 1.13.2（Apache-2.0），修复旧 1.10.2 在长路径依赖上的 Stat 错误。官方 ninja-win.zip SHA-256 已对照 GitHub release digest：07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65。参考 https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/ 。

- 1.4.0 翻页模式复用现有 MIT 许可 epub.js 的 paginated / scrolled-doc 与 @epubjs-react-native/core 滑动手势；点击翻页使用页边缘按钮，避免与正文点词竞争。过渡使用 React Native Animated，支持关闭及系统减少动态效果，暂不引入纸张卷曲引擎。参考 https://github.com/victorsoares96/epubjs-react-native 与 https://github.com/futurepress/epub.js/blob/master/documentation/md/API.md 。
- 句子标记使用书籍、章节与正文选区偏移定位，渲染前校验原文，避免误标重复句子；装饰不改写 EPUB 文本节点，不自动调用 AI。

- 阅读文字装饰使用浏览器 CSS Custom Highlight API（无需新增库），保持原文本节点与 EPUB CFI；灰色词义另置覆盖层。桥接 TypeScript 在构建前生成静态字符串，避免 Hermes Function.toString 无法返回源码的问题：https://github.com/facebook/hermes/blob/static_h/doc/Features.md 。生成命令 npm run generate:reader，构建时校验文件同步。

- `@epubjs-react-native/core`: maintained React Native wrapper around epub.js with local files, CFI progress, table of contents, swipe navigation, and text selection. MIT. A small local file-system adapter uses Expo 57's supported legacy entry point because the published adapter imports removed root APIs.
- `react-native-webview`: Expo-compatible WebView used by the EPUB renderer. MIT.

- 1.4.1：检查已安装 MIT 许可阅读器 View/template：首次 display() 在 initialLocation 跳转前发送位置。应用复用 rendition.display(CFI)，增加完成握手并过滤初始位置事件；保存统一到页面级队列。删除复用 Expo File.delete 与 SQLite 事务，文件清理队列使数据库删除与文件删除可独立重试。

- 背单词第一版参考 MIT 许可的 reactnd-flashcards，采用本地熟悉度队列，暂不引入第三方 SRS 依赖。

- 背词复习增强采用本地 due_at/interval_days 的轻量间隔复习（0、1、3、7天），先保持依赖少和离线可靠，后续可升级 FSRS。

## 1.6.0 学习闭环
- expo-sharing ~57.0.18（MIT，Expo 官方）用于本地 Anki TSV 系统分享，不新增服务器。参考 https://docs.expo.dev/versions/v57.0.0/sdk/sharing/ 。
- TSV 遵循 Anki 官方文本导入格式，Front/Back 两字段与 HTML 转义：https://docs.ankiweb.net/importing/text-files.html 。
- 简单复习间隔沿用现有 SQLite，事务日志防重复提交；不声称实现 FSRS。

## 1.6.1 翻页
继续复用 @epubjs-react-native/core（MIT）与 epub.js（BSD-2-Clause）的分页 Promise 和现有 Fling 手势；Web Animations API 仅对 viewport 做短过渡，避免增加截图/整章克隆或并行翻页。参考 https://github.com/futurepress/epub.js 和其 next/prev API。

音量键调研：react-native-volume-manager（MIT）主要监听系统音量且存在焦点相关问题；本项目用 Expo 官方 local module API 的小型 Android KeyEvent 适配，只在阅读前台窗口消费按键，不改系统音量。参考 https://docs.expo.dev/modules/native-module-tutorial/ 、https://github.com/hirbod/react-native-volume-manager 。模块由 autolinking 注册；MainActivity 钩子由 config plugin 生成，不编辑临时构建目录。

2026-09-12：采用 react-native-view-shot 5.1.0（MIT，https://github.com/gre/react-native-view-shot）及 RN Animated 做单页快照滑出，复用原分页，不复制EPUB解析。关闭上游原生Fling包装以统一WebView手势；补丁位于 scripts/apply-native-link-fix.js，安装时校验原文。段落入口用Shadow DOM隔离CFI文字偏移，默认关闭，显式点击才请求AI。

- EPUB 三页实例继续复用 @epubjs-react-native/core（MIT，已核对安装包 LICENSE 和 https://github.com/victorsoares96/epubjs-react-native ）；每个实例独立 ReaderProvider 和运行目录，邻页位置交给 epub.js next/prev 计算，避免自行推算 CFI。

- 1.9.7：复用 JSZip（MIT）解包资源与 epub.js（BSD-2-Clause）原生 OPF 加载；保留文件路径和 spine，避免改变 CFI。参考 https://github.com/futurepress/epub.js/blob/master/documentation/md/API.md 。缓存可重建，原文件不删除。

2026-09-14：复制采用 expo-clipboard（Expo SDK 57 / MIT）；正文解析采用 htmlparser2 10（MIT）；全文索引采用独立 SQLite FTS5（Public Domain）。均复用官方实现，不将整本书载入 JS 搜索状态。

2026-09-15 背词调度：核查 npm ts-fsrs 5.4.2 和 open-spaced-repetition/ts-fsrs（MIT，仓库当日仍有维护）。本次保留既有 nextReview，避免以缺失的记忆稳定度/难度重建旧到期日；新增独立纠错会话和事务结算，不声称实现 FSRS。队列与词库采用 SQLite 有界查询，复用现有 Lucide 图标及系统 TTS。
