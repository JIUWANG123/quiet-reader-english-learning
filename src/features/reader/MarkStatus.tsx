import {Pressable,Text} from 'react-native';
import {useSettings} from '../settings/SettingsProvider';
export function MarkStatus({error,retry}:{error:string;retry:()=>void}){
  const {colors}=useSettings();
  return error?<Pressable accessibilityRole="button" accessibilityLabel="重试加载标记和笔记" onPress={retry} style={{position:'absolute',bottom:110,left:16,right:16,zIndex:40,padding:12,borderRadius:12,backgroundColor:colors.surface}}>
    <Text accessibilityRole="alert" style={{color:colors.text,fontSize:12}}>{error} · 点此重试</Text>
  </Pressable>:null;
}
