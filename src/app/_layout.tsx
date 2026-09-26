import {FocusProvider} from '../features/reading-time/FocusProvider';
import { Component, Suspense, useEffect, type PropsWithChildren } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReaderProvider } from '@epubjs-react-native/core';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '../db';
import { SettingsProvider, useSettings } from '../features/settings/SettingsProvider';
import { DictionaryContextProvider } from '../features/dictionary/DictionaryContext';
import {initializeReaderDiagnostics} from '../features/reader/readerLifecycle';

class StorageBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <View style={{ flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#F7F2E8' }}><Text>本地存储未能打开。请关闭 App 后重试，并检查手机存储空间。请勿卸载，以免丢失本地书籍。</Text></View>;
    return this.props.children;
  }
}
function Navigation() {
  const { settings, colors } = useSettings();
  return <>
    <StatusBar style={settings.theme === 'dark' ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ title: 'Quiet Reader', headerShown: false }} />
      <Stack.Screen name="me" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: '阅读设置' }} />
      <Stack.Screen name="vocabulary" options={{ title: '生词本' }} />
      <Stack.Screen name="study" options={{ title: '背单词' }} />
      <Stack.Screen name="sentences" options={{ title: '句子收藏' }} />
      <Stack.Screen name="reading-log" options={{title:"今日阅读"}} />
      <Stack.Screen name="stats" options={{ title: '学习统计' }} />
      <Stack.Screen name="ai-settings" options={{ title: 'AI 连接' }} />
      <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
    </Stack>
  </>;
}
export default function RootLayout() {
  useEffect(()=>{initializeReaderDiagnostics();},[]);
  return <GestureHandlerRootView style={{ flex: 1 }}><StorageBoundary><Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
    <SQLiteProvider databaseName="app.db" onInit={initializeDatabase} useSuspense>
      <SettingsProvider><DictionaryContextProvider><ReaderProvider><FocusProvider><Navigation /></FocusProvider></ReaderProvider></DictionaryContextProvider></SettingsProvider>
    </SQLiteProvider>
  </Suspense></StorageBoundary></GestureHandlerRootView>;
}
