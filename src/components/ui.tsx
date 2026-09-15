import { Pressable, Text, View, StyleSheet, type ViewProps } from 'react-native';
import { useSettings } from '../features/settings/SettingsProvider';

export function Button({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { colors } = useSettings();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? colors.accent : colors.surface, opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}>
    <Text style={{ color: primary ? colors.background : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
}
export function Panel(props: ViewProps) {
  const { colors } = useSettings();
  return <View {...props} style={[styles.panel, { backgroundColor: colors.surface }, props.style]} />;
}
export const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: 20, borderRadius: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
