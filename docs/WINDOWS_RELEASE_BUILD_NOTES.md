# 在 Windows 上构建 Release APK：已踩过的坑

本文件记录在 **Windows + E:\My_workbooks\mending_sth\quiet-reader-english-learning**
环境下执行 `assembleRelease` 时实际遇到的三个阻塞问题，供以后避雷。

结论先行：**推荐直接用 `.github/workflows/android-apk.yml`（ubuntu-latest）出包**，
以上三个问题在 Linux 环境都不存在。

---

## 坑 1：CMake 无限重配置 —— `build.ninja still dirty after 100 tries`

### 现象

```
> Task :react-native-reanimated:buildCMakeRelWithDebInfo[arm64-v8a][reanimated] FAILED
C/C++: ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

日志里 `Re-running CMake...` 重复 100 次，每次都是 `Configuring done / Generating done`。

### 根因

`react-native-reanimated` 4.5.1 的 `android/CMakeLists.txt` 用了带 `CONFIGURE_DEPENDS`
的递归 glob：

```cmake
file(GLOB_RECURSE REANIMATED_COMMON_CPP_SOURCES CONFIGURE_DEPENDS ...)
file(GLOB_RECURSE REANIMATED_ANDROID_CPP_SOURCES CONFIGURE_DEPENDS ...)
file(GLOB_RECURSE REANIMATED_NATIVEVIEW_CPP_SOURCES CONFIGURE_DEPENDS ...)
```

配合 CMake 3.22（Android SDK 自带版本），CMake 会在 `build.ninja` 里生成一条
**无输入的 `phony` 边**：

```
build ../../../../CMakeLists.txt ../prefab/.../react-native-workletsConfigVersion.cmake ...: phony
```

`ninja -d explain` 明确指出：

```
ninja explain: output ../prefab/.../react-native-workletsConfigVersion.cmake
               of phony edge with no inputs doesn't exist
```

注意：**那个 `.cmake` 文件其实是存在的**，是这条无输入 phony 边本身让 Ninja
永远判定 `build.ninja` 脏，于是无限重跑 `RERUN_CMAKE`。

### 已确认有效的修复

在 `node_modules/react-native-reanimated/android/build.gradle.kts` 的
`externalNativeBuild.cmake.arguments(...)` 中追加：

```kotlin
"-DCMAKE_SUPPRESS_REGENERATION=ON"
```

效果：CMake 不再生成 `RERUN_CMAKE` 规则，循环消失。
实测日志中 `still dirty` 出现次数由 **2 次 → 0 次**。

### 副作用

`npm ci` 后会丢失。如需长期保留，建议做成补丁
（本项目已有 `scripts/apply-native-link-fix.js` 这种 postinstall 模式可复用）。

### 无效的尝试（不必重复）

- 删除 `reanimated/android/.cxx`（375 MB）后重建 —— 无效，错误完全一致。
- 只去掉三处 `CONFIGURE_DEPENDS` —— 只把 `[0/2]` 变成 `[0/1]`，循环依旧。
  必须用上面的 `CMAKE_SUPPRESS_REGENERATION`。

---

## 坑 2：Windows 260 字符路径上限 —— `Filename longer than 260 characters`

### 现象

坑 1 修掉后才暴露（此前一直被它挡在后面）：

```
ninja: error: Stat(safeareacontext_autolinked_build/CMakeFiles/react_codegen_safeareacontext.dir/
  E_/My_workbooks/.../react-native-safe-area-context/common/cpp/renderer/components/
  safeareacontext/RNCSafeAreaViewShadowNode.cpp.o): Filename longer than 260 characters
```

### 实测数据

| 项 | 值 |
|---|---|
| 失败路径实际长度 | **373 字符** |
| 超出上限 | **113 字符** |
| 项目根目录 `E:\My_workbooks\mending_sth\quiet-reader-english-learning` | 57 字符 |
| 系统 `LongPathsEnabled` | **0**（关闭） |

### 为什么 `subst` 短盘符救不了

`subst R: <项目根>` 只能省 **55** 字符，替代后仍约 **318** 字符。
因为那段相对路径里嵌了完整的绝对源路径（`.../CMakeFiles/xxx.dir/E_/My_workbooks/...`），
约占 180+ 字符，根目录缩得再短都不够。

### 正确的解决办法（需要管理员权限）

```powershell
# 管理员 PowerShell
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' `
  -Name LongPathsEnabled -Value 1
```

或 `gpedit.msc` → 计算机配置 → 管理模板 → 系统 → 文件系统 → 启用 Win32 长路径。
改完需重启。

也可以把项目放到更短的路径（例如 `C:\qr`）。按 373 - (57 - 5) ≈ **321** 估算，
**仅换短路径仍然不够**，必须配合长路径支持。

### 尝试过但无效

- `subst` 短盘符：省的字符数不够（见上）。
- 用 Gradle init script 注入 `-DCMAKE_OBJECT_PATH_MAX=200`，逼迫 CMake 哈希缩短对象名：
  **AGP 对 `externalNativeBuild.cmake` 做了装饰**，无论按属性访问
  （`Could not get unknown property 'arguments'`）还是 `getArguments()/setArguments()`，
  都会抛 `CustomMessageMissingMethodException`，所有模块被跳过。

> CMake 文档确实说明会对超长对象路径做哈希缩短
> （[CMAKE_OBJECT_PATH_MAX](https://cmake.org/cmake/help/v4.4/variable/CMAKE_OBJECT_PATH_MAX.html)，
> Windows 内置阈值 250）。但在本项目 373 字符的情况下未生效；
> 而想显式压低阈值的注入点在 AGP 这一层走不通。

### 参考

- [CMake/Ninja build error caused by long file paths on Windows（Nutrient）](https://www.nutrient.io/guides/react-native/troubleshooting/windows-path-length-cmake-error/)
- [react-native-screens #3471：Windows 下 CMake/Ninja 长路径失败](https://github.com/software-mansion/react-native-screens/issues/3471)
- [Rocket.Chat.ReactNative #6923：260 字符路径限制](https://github.com/RocketChat/Rocket.Chat.ReactNative/issues/6923)

---

## 推荐做法

直接用仓库里已有的 [android-apk.yml](.github/workflows/android-apk.yml)：

- 运行在 `ubuntu-latest`，**坑 1 和坑 2 都不存在**；
- 本身已是 `assembleRelease` 且带 bundle 校验步骤；
- 触发方式：Actions → Android APK → Run workflow → 选择分支。
  workflow 已在 `master` 上提交过，因此 `workflow_dispatch` 按钮可直接使用。

### 重要前提

CI 构建的是**已提交**的代码。确保改动已 commit + push，否则出来的包不含最新修复。

### 本地构建若要成功，必须满足

1. 应用坑 1 的 `CMAKE_SUPPRESS_REGENERATION=ON`；
2. 启用 Windows 长路径支持（管理员权限）**或**把项目移到足够短的路径。

---

## 附：本地构建命令（供参考）

```powershell
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a `
  --no-daemon --console=plain
```

只编 `arm64-v8a` 可显著缩短时间。产物位于
`android/app/build/outputs/apk/release/`。

> 注意：用 `gradlew ... | Out-String | Set-Content log` 时，外层管道的退出码
> 会是 `Set-Content` 的（通常 0），**不反映 Gradle 是否成功**。
> 必须以日志中的 `BUILD SUCCESSFUL` / `BUILD FAILED` 为准。
