import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function WebLayout() {
  return <>
    <StatusBar style="dark" />
    <Stack screenOptions={{ contentStyle: { backgroundColor: '#F7F2E8' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  </>;
}
