const fs = require('node:fs');
const path = require('node:path');

const edits = [
  {
    file: 'node_modules/@epubjs-react-native/core/lib/commonjs/View.js',
    before: '  onWebViewMessage,\n  waitForLocationsReady',
    after: '  onWebViewMessage,\n  onRenderProcessGone,\n  waitForLocationsReady',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/commonjs/View.js',
    before: '    onMessage: onMessage,\n    menuItems:',
    after: '    onMessage: onMessage,\n    onRenderProcessGone: onRenderProcessGone,\n    menuItems:',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/module/View.js',
    before: '  onWebViewMessage,\n  waitForLocationsReady',
    after: '  onWebViewMessage,\n  onRenderProcessGone,\n  waitForLocationsReady',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/module/View.js',
    before: '    onMessage: onMessage,\n    menuItems:',
    after: '    onMessage: onMessage,\n    onRenderProcessGone: onRenderProcessGone,\n    menuItems:',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/typescript/types.d.ts',
    before: '    onWebViewMessage?: (event: any) => void;',
    after: '    onWebViewMessage?: (event: any) => void;\n    onRenderProcessGone?: (event: { nativeEvent: { didCrash: boolean } }) => void;',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/commonjs/View.js',
    before: 'createElement(_GestureHandler.GestureHandler, {\n    width:',
    after: 'createElement(_GestureHandler.GestureHandler, {\n    enabled: enableSwipe,\n    width:',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/commonjs/utils/GestureHandler.js',
    before: 'function GestureHandler({\n  width',
    after: 'function GestureHandler({\n  enabled = true,\n  width',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/commonjs/utils/GestureHandler.js',
    before: "  if (_reactNative.Platform.OS === 'ios') {",
    after: "  if (!enabled) return _react.default.createElement(_reactNative.View, {style: {width, height}}, children);\n  if (_reactNative.Platform.OS === 'ios') {",
  },
  {
    file: 'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java',
    before: '        super(reactContext);',
    // Disable WebView's system long-press pulse, not the optional focus timer.
    after: '        super(reactContext);\n        setHapticFeedbackEnabled(false);',
  },
  // Upstream still installs Fling recognizers when enableSwipe=false. They
  // cancel WebView touches before our shared swipe/selection state can finish.
  // Pass the flag through and bypass that wrapper; keep epub.js pagination.
  {
    file: 'node_modules/@epubjs-react-native/core/lib/module/View.js',
    before: 'React.createElement(GestureHandler, {\n    width:',
    after: 'React.createElement(GestureHandler, {\n    enabled: enableSwipe,\n    width:',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/module/utils/GestureHandler.js',
    before: 'export function GestureHandler({\n  width',
    after: 'export function GestureHandler({\n  enabled = true,\n  width',
  },
  {
    file: 'node_modules/@epubjs-react-native/core/lib/module/utils/GestureHandler.js',
    before: "  if (Platform.OS === 'ios') {",
    after: "  if (!enabled) return React.createElement(View, {style: {width, height}}, children);\n  if (Platform.OS === 'ios') {",
  },
  {
    file: 'node_modules/react-native-worklets/android/CMakeLists.txt',
    before: 'target_link_libraries(worklets android log ReactAndroid::reactnative',
    after: 'target_link_libraries(worklets c++_shared android log ReactAndroid::reactnative',
  },
  {
    file: 'node_modules/react-native-screens/android/CMakeLists.txt',
    before: 'target_link_libraries(rnscreens\n',
    after: 'target_link_libraries(rnscreens\n    c++_shared\n',
  },
  {
    file: 'node_modules/react-native-reanimated/android/CMakeLists.txt',
    before: 'target_link_libraries(\n  reanimated\n',
    after: 'target_link_libraries(\n  reanimated\n  c++_shared\n',
  },
  {
    file: 'node_modules/expo-modules-core/android/cmake/common.cmake',
    before: 'target_link_libraries(\n  EXPO_COMMON\n  INTERFACE\n',
    after: 'target_link_libraries(\n  EXPO_COMMON\n  INTERFACE\n  c++_shared\n',
  },
  {
    file: 'node_modules/react-native-gesture-handler/android/src/main/jni/CMakeLists.txt',
    before: 'target_link_libraries(\n  ${PACKAGE_NAME}\n',
    after: 'target_link_libraries(\n  ${PACKAGE_NAME}\n  c++_shared\n',
  },
  {
    file: 'node_modules/react-native-safe-area-context/android/src/main/jni/CMakeLists.txt',
    before: '          ${LIB_TARGET_NAME}\n          fbjni',
    after: '          ${LIB_TARGET_NAME}\n          c++_shared\n          fbjni',
  },
  {
    file: 'node_modules/react-native/ReactAndroid/cmake-utils/default-app-setup/CMakeLists.txt',
    before: 'project(appmodules)\n\n',
    after: 'project(appmodules)\n\nlink_libraries(c++_shared)\n\n',
  },
];

for (const edit of edits) {
  const target = path.join(process.cwd(), edit.file);
  if (!fs.existsSync(target)) continue;
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(edit.after)) continue;
  if (!source.includes(edit.before)) {
    throw new Error(`Unable to apply Android native link fix to ${edit.file}`);
  }
  fs.writeFileSync(target, source.replace(edit.before, edit.after));
}
