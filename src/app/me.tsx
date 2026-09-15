import { BookMarked, ChevronRight, Clock3, MessageSquareText, Settings2, Sparkles, ChartNoAxesCombined } from 'lucide-react-native';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainNavigation } from '../components/MainNavigation';
import { useSettings } from '../features/settings/SettingsProvider';
import { TodayCard } from '../features/reading-time/TodayCard';

export default function MeScreen() {
  const { colors } = useSettings();
  const links = [
    { label: '阅读设置', note: '纸张、排版与翻页', icon: Settings2, route: '/settings' },
    { label: 'AI 连接', note: '模型与 API', icon: Sparkles, route: '/ai-settings' },
    { label: '阅读记录', note: '时长、打卡与专注', icon: Clock3, route: '/reading-log' },
    { label: '句子收藏', note: '留住值得回看的表达', icon: MessageSquareText, route: '/sentences' },
    { label: '学习统计', note: '看看一点一滴的积累', icon: ChartNoAxesCombined, route: '/stats' },
    { label: '背单词', note: '从读过的原句开始', icon: BookMarked, route: '/study' },
  ] as const;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
      <View style={{ gap: 8 }}><Text style={{ fontSize: 30, fontWeight: '600', color: colors.text }}>我的小书房</Text><Text style={{ color: colors.muted }}>每读一点，都算数。</Text></View>
      <TodayCard />
      <View style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden' }}>{links.map(({ label, note, icon: Icon, route }, i) => <Pressable key={route} accessibilityRole="button" onPress={() => router.push(route)} style={({ pressed }) => ({ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.65 : 1, borderTopWidth: i ? 1 : 0, borderTopColor: colors.background })}>
        <Icon size={22} strokeWidth={1.7} color={colors.accent} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{note}</Text></View><ChevronRight size={18} color={colors.muted} />
      </Pressable>)}</View>
    </ScrollView><MainNavigation active="me" />
  </SafeAreaView>;
}
