import {volumeKeysAvailable} from '../reader/useVolumePageTurn';
import {exportReadingDiagnostics} from '../reader/diagnostics';
import {useState} from 'react';
import { ScrollView, Text, View, Switch, Pressable } from 'react-native';
import {Minus,Plus,Check} from 'lucide-react-native';
import {IconButton} from '../../components/IconButton';
import {palettes} from './model';
import { useSettings } from './SettingsProvider';
import { Button, Panel, styles } from '../../components/ui';
import type { ThemeName, ReadingMode } from '../../types';

export default function SettingsScreen() {
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const { settings, colors, update, error } = useSettings();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 60 }}>
    <Text style={{ color: colors.muted, lineHeight: 24 }}>舒服地阅读，比读得快更重要。设置会自动保存在手机上。</Text>
    <Panel><Text style={{ color: colors.text, fontSize: 17 }}>纸张</Text><View style={styles.row}>
    {([['white', '白色'], ['paper', '米白'], ['dark', '深色']] as [ThemeName, string][]).map(([theme, label]) => <Pressable key={theme} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:settings.theme===theme}} onPress={()=>update({theme})} style={{minWidth:64,minHeight:72,alignItems:'center',justifyContent:'center',gap:7}}><View style={{width:40,height:40,borderRadius:20,backgroundColor:palettes[theme].background,borderWidth:2,borderColor:settings.theme===theme?colors.accent:colors.border,alignItems:'center',justifyContent:'center'}}>{settings.theme===theme?<Check size={18} color={palettes[theme].text}/>:null}</View><Text style={{color:colors.text,fontSize:12}}>{label}</Text></Pressable>)}
    </View></Panel>
    <Panel><Text style={{color:colors.text,fontSize:17}}>翻页模式</Text><View style={[styles.row,{flexWrap:'wrap'}]}>{([['swipe','左右滑动'],['tap','点击翻页'],['scroll','上下滚动']] as [ReadingMode,string][]).map(([readingMode,label])=><Button key={readingMode} label={label} primary={settings.readingMode===readingMode} onPress={()=>update({readingMode})}/>)}</View><Text style={{color:colors.muted,lineHeight:22}}>点击翻页模式：点击正文左右边缘翻页，中间区域仍可点词、长按划句。</Text><Button label={settings.pageAnimation?'翻页过渡动画：开':'翻页过渡动画：关'} onPress={()=>update({pageAnimation:!settings.pageAnimation})}/></Panel>
    {([
      { key: 'fontSize', label: '字号', value: settings.fontSize, step: 1, min: 16, max: 32 },
      { key: 'lineHeight', label: '行距', value: settings.lineHeight, step: 0.1, min: 1.3, max: 2.2 },
      { key: 'margin', label: '页边距', value: settings.margin, step: 2, min: 12, max: 40 },
    ] as const).map(item => <Panel key={item.key}><View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={{ color: colors.text, fontSize: 17 }}>{item.label} · {Math.round(item.value * 10) / 10}</Text>
      <View style={styles.row}><IconButton icon={Minus} label={`减小${item.label}`} disabled={item.value <= item.min} onPress={() => update({ [item.key]: item.value - item.step })} /><IconButton icon={Plus} label={`增大${item.label}`} disabled={item.value >= item.max} onPress={() => update({ [item.key]: item.value + item.step })} /></View>
    </View></Panel>)}
    <View style={{ paddingHorizontal: settings.margin, paddingVertical: 15 }}><Text style={{ color: colors.text, fontFamily: 'serif', fontSize: settings.fontSize, lineHeight: settings.fontSize * settings.lineHeight }}>She found herself strangely reluctant to leave.</Text></View>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{error}</Text> : null}
    {volumeKeysAvailable?<Panel><View style={[styles.row,{justifyContent:'space-between'}]}><Text style={{color:colors.text}}>音量键翻页</Text><Switch accessibilityLabel="音量键翻页" value={settings.volumePageTurn} onValueChange={volumePageTurn=>update({volumePageTurn})} trackColor={{false:colors.border,true:colors.accent}}/></View><Text style={{color:colors.muted,fontSize:12,lineHeight:20}}>音量减下一页，音量加上一页；打开卡片时恢复音量控制。</Text></Panel>:null}
    <Panel><Button label={exporting?'正在导出…':'导出阅读诊断'} disabled={exporting} onPress={async()=>{setExporting(true);setExportError('');try{await exportReadingDiagnostics();}catch{setExportError('导出失败，请稍后重试。');}finally{setExporting(false);}}}/><Text style={{color:colors.muted}}>遇到打开或进度问题时，可导出此文件。仅保留最近200条状态，不包含正文或API Key。</Text>{exportError?<Text style={{color:colors.text}}>{exportError}</Text>:null}</Panel>
    <Text style={{ color: colors.muted, lineHeight: 23, fontSize: 13 }}>单词查询和阅读标记离线可用，AI 仅在主动请求时联网。亮度可使用手机控制中心调整。</Text>
  </ScrollView>;
}
