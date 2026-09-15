import {Pressable,StyleSheet,View} from 'react-native';
export function TapEdges({onTurn}:{onTurn:(direction:number)=>void}) {
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}><Pressable accessibilityRole="button" accessibilityLabel="上一页" onPress={()=>onTurn(-1)} style={{position:'absolute',left:0,top:0,bottom:0,width:24}}/><Pressable accessibilityRole="button" accessibilityLabel="下一页" onPress={()=>onTurn(1)} style={{position:'absolute',right:0,top:0,bottom:0,width:24}}/></View>;
}
