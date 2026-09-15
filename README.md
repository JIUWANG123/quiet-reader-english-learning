# Quiet Reader

英文原文为主体的手机阅读器。当前已实现 PHASE 0 / PHASE 1，并开始 PHASE 2 离线词典。

## 当前可用

- Expo + React Native + TypeScript + Expo Router，面向 Android / iOS。
- 本地书库、文件选择器、TXT / EPUB 私有目录保存、导入异常处理。
- UTF-8 TXT 离线阅读、上一段 / 下一段、分段目录、系统长按选择。
- 字号、行距、页边距、白色 / 米白 / 深色主题，设置自动保存。
- SQLite 保存阅读位置、进度和上次阅读时间；滚动防抖保存，返回和转入后台触发保存。
- EPUB 本地渲染、目录、翻页、CFI 位置恢复与文本选择。
- 内置 ECDICT SQLite 离线词库（约 77 万词条）与 lemma 索引；TXT 点词显示词卡、系统 TTS 并可收藏来源原句。
- 内置原创示例，未内置商业书籍或词典；无需账号和后端。

EPUB 单击词语仍需在 PHASE 3 完善，目前可通过选择单个词打开词卡。DeepSeek、SecureStore、AI 缓存尚未接入。现有代码没有 AI 网络请求，不消耗 API token。

## 启动

需要 Node.js 22.19+、npm，以及支持 Expo SDK 57 的 Expo Go 或开发构建。

```sh
npm ci
npm start
```

在手机 Expo Go 扫描终端二维码，开发电脑与手机处于同一网络。先点击「打开阅读示例」，或导入 `fixtures/reading-test.txt`。Expo Go 支持情况以手机上安装的版本为准；不兼容时使用本地 Android 开发构建。

开发服务器只用于开发，独立安装包的离线阅读不需要服务器。当前未产生 APK，也未进行真机验收。

## Android 本地安装包

本机准备 JDK 17 和 Android SDK（可随 Android Studio 安装），设置 JAVA_HOME / ANDROID_HOME 后：

```sh
npx expo run:android
```

该命令生成并构建 Android 工程，连接手机或启动模拟器后安装开发版本。要得到不依赖 Metro 的离线试用 APK：

```sh
npx expo prebuild --platform android
cd android
# Windows PowerShell
.\gradlew.bat assembleRelease
```

APK 位于生成工程的 `app/build/outputs/apk/release/`。本地个人试用可使用生成工程的默认调试签名；正式发布需配置自己的签名。`eas.json` 另外预留可选 preview APK 配置，本项目不依赖 EAS 账号或云构建。

## 检查

```sh
npm run typecheck
npm test
npx expo install --check
npm run check:android
npm run check:ios
```

测试采用 Node 内置测试器和 SQLite，无需模拟器。覆盖导入格式、编码、长文本无损分段、Unicode 边界、设置容错、进度边界、数据库约束和关闭重开后的生产查询持久化。平台 export 只验证 JavaScript / Hermes 打包，不代表原生构建或真机通过。

当前验证详情见 [VALIDATION.md](./VALIDATION.md)，复用和许可记录见 [TECH_DECISIONS.md](./TECH_DECISIONS.md)。

## 目录

```text
src/app                  路由
src/components           共用基础控件
src/features/library     书库
src/features/reader      TXT / EPUB 阅读与位置保存
src/features/dictionary  ECDICT 查询、lemma、词卡与 TTS
src/features/settings    持久化阅读设置
src/services/books       导入、分段、数据查询
src/db                   app.db schema 与版本迁移
src/types                共享类型
tests                    数据逻辑测试
fixtures                 原创验收样本
```

书籍文件使用相对文件名存储，避免 iOS App 容器路径变化；正文分段以 book_id 索引查询。当前没有删除书籍按钮；卸载 App 会删除本地数据。

限制：书籍最大 128 MB，TXT 仅支持 UTF-8；大型 TXT 导入时会临时读取全文。词典首次启动需从安装资源复制约 69 MB 数据库。无 API Key 也可使用当前全部功能。不要把 API Key 放入源码或 EXPO_PUBLIC 环境变量。
