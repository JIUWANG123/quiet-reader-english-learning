import { BookOpen, Library, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSettings } from '../features/settings/SettingsProvider';

// Keep the main destinations reachable without placing secondary tools on the shelf.
export function MainNavigation({ active }: { active: 'library' | 'words' | 'me' }) {
  const { colors } = useSettings();
  const items = [
    { id: 'library', label: '书架', icon: Library, route: '/' },
    { id: 'words', label: '单词', icon: BookOpen, route: '/vocabulary' },
    { id: 'me', label: '我的', icon: UserRound, route: '/me' },
  ] as const;
  return <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
    {items.map(({ id, label, icon: Icon, route }) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: id === active }} onPress={() => { if (id !== active) router.replace(route); }} style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Icon size={22} strokeWidth={id === active ? 2 : 1.6} color={id === active ? colors.accent : colors.muted} />
      <Text style={{ fontSize: 11, color: id === active ? colors.accent : colors.muted, fontWeight: id === active ? '600' : '400' }}>{label}</Text>
    </Pressable>)}
  </View>;
}
