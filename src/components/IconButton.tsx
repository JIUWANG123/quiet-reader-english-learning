import {Pressable} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useSettings} from '../features/settings/SettingsProvider';
export function IconButton({icon:Icon,label,onPress,onLongPress,selected=false,disabled=false}:{icon:LucideIcon;label:string;onPress:()=>void;onLongPress?:()=>void;selected?:boolean;disabled?:boolean}){
 const {colors}=useSettings();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} onLongPress={onLongPress} style={({pressed})=>({width:48,height:48,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:selected?colors.accent:pressed?colors.surface:'transparent',opacity:disabled?.4:1})}><Icon size={22} strokeWidth={1.7} color={selected?colors.background:colors.text}/></Pressable>;
}
