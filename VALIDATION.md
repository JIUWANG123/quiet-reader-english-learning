# 1.6.1 验证（2026-09-09）

- 类型检查、36 项单测通过。
- 阅读桥接：跨内联节点长按选句、上下文、原有单词和句子标记通过。
- epub.js：连续翻页合并、关闭动画、减少动态效果、选区页边锁定、恢复 CFI 通过。
- 实际上游 EPUB 模板：滚动模式重新打开、CFI 恢复、章节 DOM 已卸载时位置回调，以及循环 JSON 修复通过。
- 音量键 hook：前台启用、弹窗禁用、后台和卸载释放通过（原生模块模拟）。
- 本章译文 UI：等待读取正文、串行翻译/邻段上下文、关闭取消、重开复用缓存通过（网络模拟）。
- 最终 APK 已生成：QuietReader-1.6.1-android.apk，版本 1.6.1 / versionCode 15，74,199,569 字节，Android 7+ / arm64-v8a。Release 构建成功（5m49s），v2 签名有效且与旧版一致，可覆盖安装。67 个应用/原生模块/插件文件与构建副本一致；4,712,500 字节脚本和完整离线词典已内置，词典哈希一致；ReaderKeysModule 已确认在 APK DEX 中。APK SHA-256：4C2363821BC218F35BC099BDC022A26CDD82288F73C03FEACF9287D5319AF7B0。
- 未进行真机实体按键/拖选/主观动画效果验收，未调用真实付费 AI。
- 后续新增的释义格式、章节分段、上下文和 token 预算测试已包含在 36 项测试内；本章译文面板关闭取消、重新打开缓存复用检查通过。

# 1.6.0 验证（2026-09-08）

- TypeScript 检查通过。
- 33 项 Node 测试通过：旧数据库修复、词形、本地查询、AI 响应分层、阅读进度、删除保留学习数据、复习事务/去重/失败回滚/每日限额、过滤和 Anki 文本格式。
- check-reading-bridge.cjs：真实浏览器选区、iframe 上下文、词形标记与句子锚点隔离通过。
- check-epub-modes.cjs：真实 epub.js 分页、滚动、标记及销毁重建后恢复 CFI 通过。
- check-study-screen.cjs：实际 React 复习页面 + SQLite 查询，词形挖空、拼写错误反馈、保存、卸载重挂后当天记录、选择题判分通过。测试替代了原生控件/系统 TTS，不等同于真机验收。
- 1.6.0 APK Release 构建成功（8m25s）；versionCode 14、arm64-v8a、minSdk24，v2 签名有效且与旧版一致。55 个源码文件匹配构建副本；脚本和完整离线词典内置且词典哈希一致。
- APK SHA-256：4AA4AC8E29CE243443AB398F5B009E792A0CE771D729501B6919B0885B719D9A。
- 未调用真实付费 AI；未验证手机原生分享菜单和听音语音包。Anki 使用系统分享导出 TSV，由用户导入 Anki Basic 的 Front/Back 字段。

历史验证记录：

# 验证记录

## 2026-09-08 · 1.4.1 验证

- TypeScript、16 项 Node 测试、生成桥接一致性检查通过。文件型 SQLite 关闭重开后，TXT 段落与 EPUB CFI/百分比均正确保留。
- 真实 epub.js 浏览器测试通过：分别在分页和上下滚动模式下保存中途 CFI、销毁 book/rendition、重建并恢复，初始首页事件不会被当作新进度接受。现有划词/句子标记测试仍通过。
- 批量删除真实 SQLite 测试通过：删除副本清理队列、进度/正文/单词及句子标记，保留其他书籍，保留生词及来源原句；关闭 foreign_keys 的独立连接情形也通过。
- 新版 Android 返回键、后台恢复、长按多选和实体文件释放仍需真机复核；当前是自动测试结果，不能替代真机验收。
- APK：D:\My DATA\Documents\ChatGPT\New project\QuietReader-1.4.1-android.apk，74,110,473 字节；版本 1.4.1 / versionCode 9，arm64-v8a / Android 7+。
- Release 构建成功；v2 签名有效，与旧版相同，可覆盖更新。SHA-256：11B6556CBABE98D3D8D9B3570528A32D3BB6F90720473EC886A85D19CDC6C63F。
- 安装包内含 4,640,288 字节 Hermes bundle 和完整离线词典，字典散列与源 asset 一致；45 个源码文件与构建副本逐字节一致。
- 真机待复核：阅读中途返回/切后台再进入、长按多选删除、手机存储释放。覆盖安装，无需卸载。


## 2026-09-08 · 1.4.0 验证

- TypeScript、15 项 Node 测试通过；新增句子结果字段隔离、阅读模式设置恢复、句子表迁移/位置隔离/删除书籍级联清理验证。
- check-reading-bridge.cjs 通过：单词标记与词形、iframe 选区上下文、句子仅当前位置高亮、跨章节隔离、原文未改写。
- check-epub-modes.cjs 通过：使用项目实际 epub.js 和 JSZip 渲染原创 EPUB，验证 next 翻页、scrolled-doc 上下滚动、切回分页，以及 book.getRange(CFI) 生成的选区与显示文档标记一致。
- 本地未收录词的 AI 按钮为主动请求；句子 UI 只渲染 translation / briefExplanation。真实模型返回与真机手势体验未在本轮验证。
- APK Release 构建成功（578 项任务）；版本 1.4.0 / 8，74,101,825 字节，arm64-v8a，v2 签名与 1.3.0 匹配；字典 asset SHA-256 一致，bundle 4,631,644 字节，43 个源码文件与打包副本一致。

## 2026-09-08 · 1.3.0 开发验证

- 最终 Release 构建成功，APK 74,086,069 字节；v2 签名通过且与 1.2.0 证书匹配，包名 com.quietreader.personal / versionCode 7 / 1.3.0 / arm64-v8a / minSdk 24。
- APK 内离线词典 SHA-256 6066F65F51997352561D9CDDCE96C2670AF5892D1C21333FAD62CC147B62758E 与源 asset 一致，Hermes bundle 4,615,888 字节，静态桥接字符串和来源句 helper 确认存在。

- TypeScript 检查、13 项 Node 测试通过。覆盖 ECDICT 词形、选中原句收藏、SQLite 进度和数据约束、文本导入，以及模拟 AI API 的上下文传递和非 JSON 容错。
- Headless Edge 390×750 阅读桥接测试通过：词形与大小写匹配、标记清除、词上方释义、iframe 选区前后文、文字变色、原正文节点保持不变。
- APK 使用构建时生成的桥接字符串，生成一致性校验通过；不依赖 Hermes 的 Function.toString。
- 目前未调用真实付费 AI API，未进行新版真机检查；APK 已构建并通过静态校验，安装启动及触摸交互仍需真机复核。
- 复核步骤：同词切换三种标记/四色、翻章再打开确认标记保留；手动开关释义确认其在词上方；点击单词 AI 解释、长按拖动后选择翻译/口语解释；相同请求第二次应显示本地缓存；断网后确认基础查词与已保存标记可用。

以下为旧版本验证记录。

2026-09-07，Windows / Node 22.19 / Expo 57。

- 已安装依赖，package-lock.json 已生成。
- TypeScript 严格检查通过。
- 10 个测试通过，包含实际 SQLite 文件关闭重开、生产进度查询、词语规范化与指定 lemma 词形。
- `expo install --check` 通过。
- `expo-doctor` 21/21 检查通过。
- Android / iOS production export 通过，生成 Hermes 字节码。
- Metro 开发服务器启动通过，`/status` 返回 running；本环境 DevTools 更新因目录权限失败后使用内置回退版。
- Android Release 原生构建已通过（547 tasks，arm64-v8a + armeabi-v7a）。使用 Temurin JDK 17、Android API 36、Build Tools 36.0.0、NDK 27.1 和 CMake 3.22.1。
- APK 已用 Android v2 签名验证，包名 `com.quietreader.personal`、minSdk 24、targetSdk 36，并确认包含两个 ARM 架构及 `assets/index.android.bundle`，无需 Metro 开发服务器。
- 1.0.1 / versionCode 2 Release APK 已构建并验签；导入上限测试常量覆盖 67 MB，设为 128 MB。
- ECDICT 构建得到 770,611 词条、182,903 lemma 词形；16,000 次索引查询在本机约 526 ms，平均约 0.033 ms/次。
- Android export 已确认包含约 69 MB 的 `dictionary.db` 资源。
- 1.1.0 / versionCode 4 ARM64 Release APK 构建通过；APK 内含 68,878,336 字节的词典资源、离线 JS bundle，并通过 Android v2 签名验证。
- 1.1.1 / versionCode 5 修复 EPUB 长按查词：增加 Android/iOS 原生选区工具栏“查词”动作，并兼容单词两侧标点；TypeScript、10 项测试和 ARM64 Release 构建通过。
- npm audit：13 moderate，0 high / critical，详见技术选择；不是无漏洞状态。

## 手机待验收

1. 打开原创示例；退出后重开，确认位置恢复。
2. 导入 fixtures/reading-test.txt；取消选择器不新增书；同名书籍分别保留。
3. 导入 UTF-8 长 TXT，滚动到段中；切换段落、目录、返回书库、后台再前台、彻底关闭再启动。
4. 修改字号/行距/页边距，检查无裁切；依次检查三种主题、系统状态栏和底部安全区。
5. 导入空 TXT、非 UTF-8 TXT、不支持格式、67 MB 文件和超过 128 MB 的文件，确认限制及错误处理正确且不留下半条书库记录。
6. 开飞行模式，用独立安装包重复阅读、导入、修改设置，确认离线可用。
7. EPUB：导入后打开、翻页/滚动、目录、进度保存、点词与文本选择均需真机复核。

## 后续阶段保留验收

- lemma 自动化测试已通过：give / gave / given → give；taking → take；teeth → tooth；children → child；reluctant / contemptuous 精确查询。真机仍需确认卡片显示、TTS 和收藏。
- AI：fixtures 中四个目标句应附带相邻段落；hint 不泄漏整句翻译；缓存命中不调用 API；无 Key 时词典与阅读照常可用。
- AI 检查目前没有实现，不能计作通过。

