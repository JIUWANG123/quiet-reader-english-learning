import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeProviderError, sanitizeAIDiagnosticError, type AIDiagnosticEvent} from '../src/services/ai/diagnosticsModel';
import {testAIConnection} from '../src/services/ai/provider';
test('AI diagnostics redact credentials, endpoint URLs and request content while retaining safe provider reasons',()=>{
 const safe=sanitizeAIDiagnosticError('HTTP 400 https://api.example.test/v1?token=private Authorization: Bearer abc123 invalid model: secret-model');
 assert.equal(safe,'HTTP 400 [地址已隐藏] Authorization: [凭证已隐藏] 模型配置错误');
});
test('provider errors retain service details while redacting secrets and echoed prompts',()=>{
 assert.equal(sanitizeProviderError(401,{error:{type:'auth_error',message:'invalid api key: sk-secretkey12345678 prompt: private text'}}),'AI 请求失败（401）：invalid api key: [凭证已隐藏] [内容已隐藏]');
});
test('AI diagnostics keep only the latest fifty entries',()=>{
 const rows:AIDiagnosticEvent[]=Array.from({length:55},(_,i)=>({time:i,event:'failure',mode:'word',stage:'request',duration:12,error:'超时'}));
 assert.equal(rows.slice(-50)[0].time,5);
});
test('connection test reports HTTP provider errors with status and safe summary',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({error:{type:'invalid_request_error',message:'model not supported'}}),{status:400});
 try{await assert.rejects(()=>testAIConnection('key',{baseUrl:'https://example.test',model:'bad',temperature:0}),/AI 请求失败（400）.*model not supported/);}finally{globalThis.fetch=original;}
});
