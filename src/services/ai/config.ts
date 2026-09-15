import * as SecureStore from 'expo-secure-store';

export type AIConfig = { baseUrl: string; model: string; temperature: number };
export const defaultAIConfig: AIConfig = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', temperature: 0.2 };
const KEY = 'quiet-reader.ai-key';
const CONFIG = 'quiet-reader.ai-config';

export async function loadAIConfig() {
  const [apiKey, raw] = await Promise.all([SecureStore.getItemAsync(KEY), SecureStore.getItemAsync(CONFIG)]);
  try { return { apiKey: apiKey ?? '', config: { ...defaultAIConfig, ...JSON.parse(raw ?? '{}') } as AIConfig }; }
  catch { return { apiKey: apiKey ?? '', config: defaultAIConfig }; }
}
export async function saveAIConfig(apiKey: string, config: AIConfig) {
  const url=new URL(config.baseUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('请输入不含参数的 HTTPS API 地址');
  if(!config.model.trim())throw new Error('请输入模型名称');
  await Promise.all([SecureStore.setItemAsync(KEY, apiKey.trim()), SecureStore.setItemAsync(CONFIG, JSON.stringify(config))]);
}
