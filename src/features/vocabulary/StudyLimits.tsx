import {useEffect,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {Button,styles} from '../../components/ui';
import {useSettings} from '../settings/SettingsProvider';
import type {Plan} from '../../services/vocabulary/review';
export function StudyLimits({plan,busy,onSave}:{plan:Plan;busy:boolean;onSave:(plan:Plan)=>void}){
 const {colors}=useSettings();const [fresh,setFresh]=useState(String(plan.newLimit)),[review,setReview]=useState(String(plan.reviewLimit));
 useEffect(()=>{setFresh(String(plan.newLimit));setReview(String(plan.reviewLimit));},[plan]);
 const valid=/^\d{1,3}$/.test(fresh)&&/^\d{1,3}$/.test(review)&&Number(fresh)<=200&&Number(review)<=200;
 return <View style={{gap:12}}><Text style={{color:colors.muted}}>每日引入上限 · 下一组生效</Text>
 {[[fresh,setFresh,'新词'],[review,setReview,'复习']] .map(([value,setter,label])=><View key={String(label)} style={{gap:6}}><Text style={{color:colors.text}}>{String(label)}</Text><TextInput accessibilityLabel={`每日${label}上限`} keyboardType="number-pad" value={String(value)} editable={!busy} onChangeText={setter as (value:string)=>void} style={{minHeight:48,padding:12,color:colors.text,borderWidth:1,borderColor:colors.border,borderRadius:12}}/></View>)}
 <Text style={{color:colors.muted}}>学习顺序</Text><View style={styles.row}><Button label="默认顺序" primary={(plan.order??'default')==='default'} disabled={busy} onPress={()=>onSave({newLimit:Number(fresh),reviewLimit:Number(review),order:'default'})}/><Button label="高频优先" primary={plan.order==='frequency'} disabled={busy} onPress={()=>onSave({newLimit:Number(fresh),reviewLimit:Number(review),order:'frequency'})}/></View><Button label="保存额度" disabled={busy||!valid} onPress={()=>onSave({newLimit:Number(fresh),reviewLimit:Number(review),order:plan.order??'default'})}/>
 </View>;
}
