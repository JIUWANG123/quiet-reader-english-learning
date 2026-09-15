import { StyleSheet, Text, View } from 'react-native';

export default function WebLibraryPreview() {
  return <View style={styles.screen}>
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
        <Text style={styles.title}>Quiet Reader</Text>
        <Text style={styles.subtitle}>安静地读懂英文</Text>
      </View>
      <View style={styles.settings}><Text style={styles.settingsText}>Aa</Text></View>
    </View>
    <View style={styles.empty}>
      <Text style={styles.book}>Aa</Text>
      <Text style={styles.emptyTitle}>书库还是空的</Text>
      <Text style={styles.emptyText}>导入 EPUB 或 TXT，开始你的英文阅读。</Text>
    </View>
    <View style={styles.importButton}><Text style={styles.importText}>＋ 导入文件</Text></View>
    <Text style={styles.note}>网页侧边栏为界面预览；书籍和阅读记录保存在手机本地。</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: '100vh' as never, maxWidth: 480, width: '100%', alignSelf: 'center', backgroundColor: '#F7F2E8', padding: 24 },
  header: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#8A765D', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#28231D', fontSize: 34, lineHeight: 42, fontWeight: '700', marginTop: 8 },
  subtitle: { color: '#766B5D', fontSize: 15, marginTop: 4 },
  settings: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAE0D0', alignItems: 'center', justifyContent: 'center' },
  settingsText: { color: '#4A4034', fontWeight: '700', fontSize: 16 },
  empty: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  book: { width: 84, height: 108, borderRadius: 8, backgroundColor: '#DDD0BC', color: '#7A6851', fontSize: 28, lineHeight: 108, textAlign: 'center', overflow: 'hidden' },
  emptyTitle: { color: '#342D25', fontSize: 20, fontWeight: '600', marginTop: 24 },
  emptyText: { color: '#817567', fontSize: 14, marginTop: 10, textAlign: 'center' },
  importButton: { height: 54, borderRadius: 27, backgroundColor: '#3F5948', alignItems: 'center', justifyContent: 'center' },
  importText: { color: '#FFFDF8', fontSize: 17, fontWeight: '600' },
  note: { color: '#998D7F', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 14, marginBottom: 8 },
});
