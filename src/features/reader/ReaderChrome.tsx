import {useEffect,useRef,type ReactNode} from 'react';
import {Animated,type StyleProp,type ViewStyle} from 'react-native';
// Keep the reader viewport fixed while controls fade, preserving CFI and selection geometry.
export function ReaderChrome({visible,children,style}:{visible:boolean;children:ReactNode;style?:StyleProp<ViewStyle>}) {
  const opacity=useRef(new Animated.Value(visible?1:0)).current;
  useEffect(()=>{const animation=Animated.timing(opacity,{toValue:visible?1:0,duration:180,useNativeDriver:true});animation.start();return ()=>animation.stop();},[visible,opacity]);
  return <Animated.View pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={[style,{opacity}]}>{children}</Animated.View>;
}
