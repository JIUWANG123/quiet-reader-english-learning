export type AIDiagnosticEvent={time:number;event:'started'|'progress'|'success'|'failure';mode:string;stage:string;duration:number;status?:number;error?:string;cached?:boolean};
export type AIDiagnosticRecorder=(entry:AIDiagnosticEvent)=>void;

export function sanitizeAIDiagnosticError(message:string){
 return message
  .replace(/https?:\/\/[^\s"'<>]+/gi,'[地址已隐藏]')
  .replace(/\bBearer\s+[^\s,;]+/gi,'[凭证已隐藏]')
  .replace(/\brequest[_ -]?id\s*[:=]\s*[^\s,;]+/gi,'request_id: [已隐藏]')
  .replace(/\b(?:Bearer\s+)?(?:sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{24,})\b/gi,'[凭证已隐藏]')
  .replace(/\b(invalid\s+)?(api[_ -]?key|authorization|token|secret)\s*[:=]\s*[^\s,;]+/gi,'$1$2: [凭证已隐藏]')
  .replace(/\b(?:invalid\s+model|model)\s*[:=]\s*[^\s,;]+/gi,'模型配置错误')
  .replace(/(?:prompt|content|targetText|previousContext|followingContext)\s*[:=]\s*[^\n;]+/gi,'[内容已隐藏]')
  .replace(/\s+/g,' ').trim().slice(0,240);
}

export function keepRecentAIDiagnostics(rows:AIDiagnosticEvent[]){return rows.slice(-50);}

export function sanitizeProviderError(status:number,body:unknown){
 let message='';
 try{const parsed=typeof body==='string'?JSON.parse(body):body;const error=(parsed as {error?:{message?:unknown;type?:unknown;code?:unknown}})?.error;
  message=typeof error?.message==='string'?error.message:[error?.type,error?.code].filter(value=>typeof value==='string').join(': ');
 }catch{message='';}
 const safe=sanitizeAIDiagnosticError(message);
 return `AI 请求失败（${status}）${safe?`：${safe}`:''}`;
}
