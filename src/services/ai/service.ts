import {shortMeaning} from '../../features/reader/shortMeaning';
import type { SQLiteDatabase } from 'expo-sqlite';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { loadAIConfig } from './config';
import { OpenAICompatibleProvider, promptVersion, type AIRequest } from './provider';

export async function requestAssistance(db: SQLiteDatabase, request: AIRequest, signal?:AbortSignal, forceRefresh=false) {
  const { apiKey, config } = await loadAIConfig();
  const contextLimit=request.mode==='mark_meaning'?700:2500;
  const bounded = { ...request, previousContext: request.previousContext.slice(-contextLimit), targetText: request.targetText.slice(0, 3000), followingContext: request.followingContext.slice(0, contextLimit) };
  if (!bounded.targetText.trim()) throw new Error('请先选择文本。');
  const cacheKey = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([promptVersion, config, bounded.mode, bounded.targetText, bounded.previousContext, bounded.followingContext]));
  const cached = await db.getFirstAsync<{response_json: string}>('SELECT response_json FROM ai_cache WHERE cache_key=?', cacheKey);
  if (cached&&!forceRefresh) { try { const value=JSON.parse(cached.response_json) as Record<string, unknown>;if(request.mode==='chapter'&&(typeof value.translation!=='string'||!value.translation.trim()))throw Error('Invalid cached translation');if(request.mode==='mark_meaning'&&!shortMeaning(typeof value.shortMeaning==='string'?value.shortMeaning:''))throw Error('Invalid cached meaning');return {value,cached:true}; } catch { /* Retry corrupt cache. */ } }
  if (!apiKey) throw new Error('请先在首页的 AI 连接中填写 API Key。');
  const url = new URL(config.baseUrl);
  if (url.protocol !== 'https:') throw new Error('AI 地址必须使用 HTTPS。');
  if(signal?.aborted) throw new Error('请求已取消');
  const value = await new OpenAICompatibleProvider(apiKey, config).assist(bounded,signal);
  if(request.mode==='chapter'&&(typeof value.translation!=='string'||!value.translation.trim()))throw new Error('AI 译文格式不完整，请重试。');
  if(request.mode==='mark_meaning'&&!shortMeaning(typeof value.shortMeaning==='string'?value.shortMeaning:''))throw new Error('AI 未返回有效简释，请重试');
  await db.runAsync('INSERT OR REPLACE INTO ai_cache(cache_key,mode,target_text,response_json,model,created_at) VALUES(?,?,?,?,?,?)', cacheKey, request.mode, bounded.targetText, JSON.stringify(value), config.model, Date.now());
  return { value, cached: false };
}
