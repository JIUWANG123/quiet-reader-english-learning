请基于当前 GitHub 仓库：

`JIUWANG123/quiet-reader`

继续优化 QuietReader 当前最新版本 **1.11.2**。

当前 GitHub master 已经同步到 1.11.2，不再存在旧源码问题。

本轮只解决两个核心问题：

1. EPUB 阅读器刚进入时，翻页动画有时暂时不能使用，需要等待邻页加载；
2. App 偶尔发生崩溃，目前尚未获得足够诊断数据确认究竟是 WebView renderer、OOM、native crash、JS exception 还是其他原因。

请不要重新设计整个阅读器，也不要推翻现有三页 WebView / NativePageStack 架构。

必须保留已经完成并验证过的机制：

- NativePageStack UI-thread readiness；
- `PageStackHandle.setReadiness()`；
- pageKey 防止 stale readiness 解锁错误页面；
- revision / generation 防迟到 preview；
- 三页 WebView 循环复用；
- CFI 进度恢复；
- visualAnchor 快速恢复；
- paragraph translation；
- 标记、释义、选区；
- swipe / 按钮 / 音量键共用 readiness；
- progress saver last-write-wins；
- 当前页位置在异常情况下不能被第一页或未知位置覆盖。

禁止为了优化首次翻页退回单 WebView 或完全取消邻页预览。

---

# 一、先验证当前已发现的启动链路

当前真实 1.11.2 手机诊断表现出以下现象：

current 页面完成 `restore-ready` 后，previous 和 next 会几乎同时开始：

`preview-request previous`
`preview-request next`

之后约 300ms，两边可能同时从 generation 0 变成 generation 1。

也就是说刚创建的两个 neighbor 在尚未 ready 前就发生了 invalidation。

请优先确认这次 invalidation 的确切来源。

重点检查：

- `EpubReader.tsx`
- `epubParagraphBridge.ts`
- `epubPool.ts`
- `epubVisualPosition.ts`
- `restoreEpubPosition`
- 所有调用 `invalidateEpubNeighbors()` 的地方

目前高概率链路为：

current page：
`restore`
→ decoration
→ 两个 requestAnimationFrame
→ `qr-page-painted`
→ RN 立即设置 `restored=true`
→ `restore-ready`
→ previous/next 创建

但 paragraph bridge 中：
`relayout()`
→ debounce 100ms
→ 两个 RAF
→ `qr-paragraph-layout`

这个事件可能晚于 `restore-ready` 到达。

`EpubReader` 随后执行：

`invalidateEpubNeighbors(...)`

于是刚创建的 previous / next 一起失效并 revision++。

请不要直接假设，一定通过诊断或测试确认。

增加临时/正式诊断：

`neighbor-invalidated`

至少记录：

- reason
- current document id
- previous id/revision
- next id/revision
- layout revision
- timestamp
- current ready 状态

reason 至少区分：

- paragraph-layout
- font/layout change
- mode change
- viewport change
- manual jump
- other

禁止记录正文或完整 CFI，沿用 fingerprint。

---

# 二、建立真正的“最终布局稳定屏障”

如果确认 paragraph layout 会晚于 page-painted，则修改初始化协议。

当前不能再认为：

“装饰完成 + 两帧 RAF”

就等于页面最终稳定。

建议为 paragraph bridge 增加明确的 layout stabilization API，例如：

`window.qrEpubParagraphs.whenLayoutStable()`

或者等价机制。

目标：

当 paragraph bridge 触发任何会影响分页的变化：

- translation controls attach
- visibility change
- paragraph state restore
- resize
- translated paragraph open/close

都更新：

`layoutEpoch`

并维护 pending layout state。

一个 layout cycle 完成条件：

1. debounce 结束；
2. resize 已触发；
3. 至少两次 requestAnimationFrame；
4. `rendition.manager.currentLocation()` 能返回有效位置；
5. 自最后一个 layout mutation 起没有新的 layoutEpoch。

然后才视为 stable。

修改 `qrPaintPage`：

原本类似：

`decorate`
→ RAF
→ RAF
→ `qr-page-painted`

改成：

`decorate`
→ await paragraph/layout stable
→ RAF
→ RAF
→ capture visual position
→ `qr-page-painted`

要求：

- paragraph translation 功能关闭且没有 pending layout 时立即返回；
- 不增加固定数百毫秒无条件等待；
- 用事件/epoch 判断，而不是简单 setTimeout 500ms；
- stale revision 在等待过程中出现时立即终止；
- layout stable 不能造成无限等待，需要独立 watchdog；
- timeout 不能错误保存进度。

最终语义必须变成：

`qr-page-painted`

代表：

**当前页面已经完成最终可见排版，之后不会因为初始化阶段的 paragraph/layout 再立即 invalidate neighbors。**

---

# 三、冷启动邻页改为顺序预热

当前 current ready 后，`readyEpubDocument()` 会立即创建：

- previous
- next

EpubReader 随后同时启动两个 hidden reader preview。

请改成冷启动阶段：

### Stage 1

只挂载 / 恢复 current。

在 current：

- position restored
- decoration complete
- layout stable
- page painted

之前不要创建两个 neighbor。

### Stage 2

current 正式 ready 后：

**优先创建 next。**

因为正常阅读主要向后翻。

冷启动阶段最多允许：

`current + 1 个正在初始化的 hidden neighbor`

同时进行高负荷 EPUB navigation/layout。

### Stage 3

next `qr-page-painted` / ready 后：

再创建 previous。

### 用户反向操作

如果 previous 尚未 ready，但用户明确执行：

- 左滑
- 上一页按钮
- 音量键上一页

则：

- 提高 previous 的优先级；
- 如果 next 仍在 preview，不要同时重建两个 WebView；
- 可以让 previous 成为下一项 preview job；
- 不允许出现两个冷启动 navigation 同时抢资源。

注意：

稳定进入正常阅读之后，仍然保持三页循环复用。

不要破坏原有：

previous / current / next

三页架构。

---

# 四、重构 preview timeout 分类

当前源码存在类似逻辑：

`revision > 0 && !document.retries ? 1800 : 8000`

这个判断需要删除。

因为：

`revision > 0`

不代表一定是 warm preview。

revision 增加可能来自：

- 正常 WebView recycle；
- paragraph layout invalidation；
- viewport/layout change；
- retry；
- startup race；
- mode rebuild。

必须明确区分 preview job 类型。

建议为 EpubDocument 或 preview job 增加：

`origin`

可能值：

- cold
- recycled
- layout
- retry

或者最少区分：

- warm
- cold

---

# 五、1800ms 改成 soft timeout，不再直接杀任务

真实诊断已经出现：

preview 在约 1814ms 被 PREVIEW_TIMEOUT 杀掉，

但重新运行后约 1811ms 就成功。

这证明 1800ms 的 hard timeout 太激进。

改为至少两级：

`SOFT_PREVIEW_TIMEOUT = 1800ms`

`HARD_PREVIEW_TIMEOUT = 5000~8000ms`

具体：

### soft timeout

1800ms 时：

只记录：

`preview-slow`

包括：

- requestId
- generation
- direction
- origin
- duration
- current stage

禁止：

- cancel preview；
- revision++；
- destroy WebView；
- retry；
- clear valid partial state。

### hard timeout

只有在 5000~8000ms：

并且 preview 长时间没有任何阶段推进，

才认为：

`PREVIEW_TIMEOUT`

此时才能：

- cancel old generation；
- mark failure；
- schedule retry。

---

# 六、增加 preview stage watchdog

不要只从 request 开始计算一个固定 timeout。

为每个 preview job记录：

- created
- webview-mounted
- webview-ready
- navigation-start
- position-restored
- preview-step-start
- preview-step-complete
- decoration-start
- decoration-complete
- layout-stable
- page-painted
- ui-readiness-ack

保存：

`lastProgressAt`

如果 stage 有推进：

刷新 watchdog。

hard timeout 应判断：

“连续 N 秒没有任何推进”

而不是：

“从任务开始 N 秒”。

这样大书和慢设备不会因为正常工作时间较长被误杀。

---

# 七、禁止双 neighbor timeout/rebuild 风暴

当前危险路径：

previous timeout
+
next timeout

两边同时：

- revision++
- React key 改变
- old WebView unmount
- new WebView mount
- epub.js 初始化
- navigation

这会制造非常高的瞬时内存和 CPU 峰值。

必须增加 preview scheduler。

原则：

任何时刻最多一个 hidden neighbor 可以进入：

`rebuild / retry / heavy navigation`

状态。

如果 previous 和 next 都失败：

建立队列：

1. 用户即将翻到的方向优先；
2. 默认 next 优先；
3. 第一个恢复后再处理另一个。

禁止两个 hidden WebView 同时重建。

retry 必须有 backoff。

例如：

第一次：
500ms

第二次：
1500ms

达到有限次数后停止自动重建。

---

# 八、hidden preview 失败不能让整个阅读器失败

目前类似：

neighbor 第二次加载失败

可能调用：

`setFailure(...)`

导致整个阅读界面弹错误 Modal。

修改行为。

hidden previous / next 加载失败：

不能结束 current 阅读会话。

应该：

- current 保持可阅读；
- 该方向 readiness=false；
- 记录 neighbor failure；
- 后台有限 retry；
- 用户真正往这个方向翻时提高 retry 优先级。

只有：

**current WebView / current restore**

失败，才允许显示全局恢复 Modal。

---

# 九、增加 WebView renderer crash 诊断

目前 diagnostics 无法判断偶发崩溃。

项目使用：

`react-native-webview 13.16.1`

Android API 26+ 支持：

`onRenderProcessGone`

检查 `@epubjs-react-native/core` 的 Reader 是否可以向内部 WebView 传递该 callback。

如果可以：

直接接。

如果不能：

通过现有：

`scripts/apply-native-link-fix.js`

做最小、可重复 patch。

禁止只手改 node_modules。

增加诊断事件：

`webview-process-gone`

记录：

- sessionId
- documentId fingerprint
- slot
- revision
- active
- didCrash
- timestamp

不能记录正文和完整 CFI。

### hidden neighbor renderer gone

行为：

- current 不受影响；
- neighbor readiness=false；
- 从 pool 中安全失效；
- 延迟单独重建；
- 不能导致全局 Modal；
- 不能同时重启另一个 neighbor。

### current renderer gone

行为：

1. 使用最后 committed CFI；
2. 不把未知位置或第一页写入数据库；
3. 保存/保留 recovery journal；
4. 结束当前 broken reader；
5. 重建 session；
6. 从 committed CFI 恢复。

---

# 十、增加 Android ApplicationExitInfo

为真正定位“整个 App 偶尔崩溃”的原因：

Android API 30+ 增加 native module / Expo module：

读取：

`ActivityManager.getHistoricalProcessExitReasons`

下次 App 启动时读取最近一次本应用进程退出原因。

至少识别：

- REASON_CRASH
- REASON_CRASH_NATIVE
- REASON_ANR
- REASON_LOW_MEMORY
- REASON_EXCESSIVE_RESOURCE_USAGE
- REASON_USER_REQUESTED
- REASON_SIGNALED
- UNKNOWN

如果 API 支持：

记录：

- reason
- importance
- pss
- rss
- timestamp

新增诊断：

`previous-process-exit`

不要把：

user requested / normal terminate

错误标记成 crash。

这是诊断，不是自动下结论。

---

# 十一、增加 reader session lifecycle

每次打开阅读器生成：

`sessionId`

新增诊断：

- reader-session-start
- reader-session-ready
- reader-session-background
- reader-session-foreground
- reader-session-clean-end
- reader-session-recover

正常退出必须：

`clean-end`

如果下次启动发现上一 session：

有 start
但没有 clean-end

只记录：

`previous-session-unclean`

不要直接称为 crash。

结合 ApplicationExitInfo 才判断。

---

# 十二、修复 runtime directory 清理时机

检查：

`useEpubFileSystem.ts`

目前 WebView unmount 后立即：

`folder.delete()`

这存在潜在生命周期竞态。

改为：

WebView unmount：

只登记 runtime directory 为 stale。

实际清理由以下方式之一完成：

方案优先：

- App 下次启动统一扫描并清理 stale runtime；
或
- 延迟数秒后确认 session/document 已完全失效再清理。

要求：

- active runtime 永远不能被删除；
- 新 session 同名目录不能被旧 cleanup 删除；
- cleanup 必须验证 session/runtime token；
- cleanup 失败不影响阅读；
- 不删除书籍本体、数据库或 epub resource cache。

增加自动测试。

---

# 十三、内存压力策略

增加 AppState 处理。

App 进入 background：

优先：

- 暂停 neighbor preview；
- 取消 pending retry；
- 可考虑释放 hidden previous / next；
- 保留 current committed CFI。

foreground：

- current 不应无必要重建；
- 如果 hidden neighbor 已释放，按：
  next → previous
  顺序重新 warm。

如果项目可以合理接 Android trim memory：

在：

`TRIM_MEMORY_RUNNING_LOW`
`TRIM_MEMORY_RUNNING_CRITICAL`

优先释放 hidden WebView。

绝不能优先销毁 current。

---

# 十四、JSZip 本轮先分析，不要贸然大改

检查：

`epubResources.ts`

当前：

`archive.arrayBuffer()`
→ `JSZip.loadAsync()`
→ entry `uint8array`

会造成内存峰值。

但当前流程：

`prepareEpubResources`

在 `EpubReaderSession` 挂载之前完成。

所以不要把它当作已经确认的 WebView 崩溃根因。

本轮：

增加资源准备诊断：

- archive size
- unzip duration
- extracted size
- cache hit
- cache miss

大小只记录数字。

如果 EPUB 已有完整 resource cache：

不得重新解压。

长期优化可以考虑：

- import 时预解包；
- native streaming unzip。

但本轮不要为了这个破坏：

- CFI
- spine 顺序
- bookmarks
- existing imported books。

---

# 十五、diagnostics 扩展

当前已有：

- preview-request
- preview-ready
- preview-error
- gesture-start
- gesture-blocked
- gesture-release
- restore-ready
- restore-error

新增：

- preview-slow
- preview-stage
- neighbor-invalidated
- webview-process-gone
- reader-session-start
- reader-session-ready
- reader-session-clean-end
- reader-session-background
- reader-session-foreground
- previous-session-unclean
- previous-process-exit
- memory-pressure

不要让日志量无限增长。

仍维持 ring buffer。

可以从 200 条提高到：

500 条

前提是文件仍然非常小。

禁止记录：

- 正文；
- 译文；
- API key；
- 完整 CFI；
- 文件真实路径；
- 用户书名。

---

# 十六、自动测试

新增/修改测试覆盖：

### layout stable

1. paragraph relayout 未完成时不得发 page-painted；
2. layout epoch 更新后旧 stable promise 不得完成；
3. no paragraph change 时快速完成；
4. stale revision 等待期间必须退出。

### cold warm scheduler

1. current ready 后首先只创建 next；
2. next ready 后才创建 previous；
3. 用户请求 previous 时可以调整优先级；
4. 不允许两个 cold preview 同时 heavy navigation。

### timeout

1. 1800ms 只记录 preview-slow；
2. soft timeout 不改变 revision；
3. soft timeout 不销毁 WebView；
4. 1810~3000ms 后成功仍接受；
5. hard timeout 才触发 retry；
6. stage progress 会刷新 watchdog。

### rebuild scheduler

previous + next 同时失败：

只能一个一个重建。

### hidden failure

neighbor failure 不得：

`setFailure` current reader。

### renderer gone

hidden crash：
current 不动。

current crash：
使用 committed CFI recover。

### runtime cleanup

旧 session cleanup：

不能删除当前 session runtime。

---

# 十七、Android 真机 / 模拟器验收

不要只跑 Node / Playwright。

必须做 Android 原生测试。

至少：

### Cold startup

同一本 EPUB：

20 次

步骤：

1. 完全退出阅读器；
2. 打开书；
3. current 出现后尽快向后翻。

统计：

- current restore latency
- next ready latency
- first successful page turn latency
- PREVIEW_PENDING 次数
- PREVIEW_SLOW 次数
- PREVIEW_TIMEOUT 次数

目标：

启动期间不再频繁出现：

generation 0
→ 立即 generation 1

如果出现：

必须通过 neighbor-invalidated reason 解释。

### 连续翻页

100 页 forward

再：

50 次 forward/backward alternating。

观察：

- preview timeout
- renderer gone
- progress correctness
- visual jump
- blank page
- duplicate page
- stale commit

### Layout

10 次：

- 字号切换
- 行距
- 页边距
- paragraph translation 显隐

不能出现旧 neighbor 被错误提升。

### Background

10 次：

阅读
→ background
→ foreground
→ 立即翻页

### Crash / recovery

如果可以人为 kill WebView renderer：

验证 hidden/current 两种恢复路径。

### Memory

使用：

`adb shell dumpsys meminfo`

至少采样：

- cold current only
- next warm
- full 3 pages
- after 50 turns
- after 100 turns
- background
- foreground

输出：

PSS / RSS

观察是否持续增长。

---

# 十八、不要提前提升版本

本轮先继续使用：

1.11.2 development build。

在以下条件全部满足之前：

禁止修改正式版本号；
禁止声明“彻底解决崩溃”。

需要先获得：

- Android 原生数据；
- WebView renderer diagnostics；
- process exit reason；
- preview timeout 数据；
- memory 数据。

如果尚未抓到真实 crash：

正确结论应是：

“已消除已确认的 preview/rebuild 高风险路径，并增加 crash diagnostics；真实 crash root cause 等下一次设备事件确认。”

不能冒充已经找到崩溃根因。

---

# 十九、最终汇报格式

完成后给我：

## 1. Root cause

分别说明：

### First-page paging delay

已确认原因
证据
代码路径

### App crash

已确认
未确认
目前证据

禁止混在一起。

## 2. Modified files

逐个列出：

文件
修改内容
原因

## 3. Before / After

包括：

- current restore p50/p95/max
- next ready p50/p95/max
- first turn latency
- PREVIEW_PENDING
- PREVIEW_SLOW
- PREVIEW_TIMEOUT
- neighbor invalidation count
- WebView renderer gone
- unclean session
- process exit reason
- PSS/RSS

## 4. Tests

- TypeScript
- unit tests
- Playwright / real epub
- Android native
- memory
- background/foreground

## 5. Remaining risks

明确列出仍未验证的问题。

---

本轮目标不是让动画“看起来更快”。

目标是：

**current 只有在最终布局稳定后才正式 ready；冷启动避免两个 hidden WebView 同时争资源；正常耗时 preview 不再被 1800ms 误杀；neighbor failure 不再拖垮当前阅读；并建立足够的 Android/WebView 崩溃诊断，让下一次异常可以真正定位根因。**