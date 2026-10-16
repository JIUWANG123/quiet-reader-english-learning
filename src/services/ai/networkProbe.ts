import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type { AIDiagnosticRecorder } from './diagnosticsModel';

type ProbeResult = { ok: boolean; code?: string; durationMs: number; addresses?: string[]; address?: string };
type NetworkProbeNative = {
  resolveDns(host: string): Promise<ProbeResult>;
  checkTcp(addresses: string[]): Promise<ProbeResult>;
  checkTls(host: string, address: string): Promise<ProbeResult>;
};

function messageFor(stage: string, code?: string) {
  if (stage === 'dns') return code === 'DNS_TIMEOUT' ? 'DNS 查询超时：手机的域名解析服务没有响应。' : 'DNS 解析失败：检查当前网络或 DNS 设置。';
  if (stage === 'tcp') return code === 'TCP_TIMEOUT' ? 'DNS 正常，但到服务器 443 端口连接超时。' : code === 'TCP_REFUSED' ? 'DNS 正常，但服务器拒绝了 443 端口连接。' : 'DNS 正常，但无法建立到服务器的 TCP 连接。';
  if (code === 'TLS_TIMEOUT') return 'TCP 连接成功，但 TLS 握手超时。';
  if (code === 'TLS_CERTIFICATE_OR_PROTOCOL') return 'TCP 连接成功，但 TLS 证书或协议校验失败。';
  return 'TCP 连接成功，但 TLS 握手失败。';
}

export async function probeAIHost(host: string, diagnose: AIDiagnosticRecorder, onStage: (stage: string) => void) {
  if (Platform.OS !== 'android') throw new Error('分阶段网络探测目前仅支持 Android。');
  const native = requireNativeModule<NetworkProbeNative>('NetworkProbe');
  const steps: Array<{ key: 'dns' | 'tcp' | 'tls'; label: string; run: () => Promise<ProbeResult> }> = [];

  onStage('正在查询 DNS…');
  const dnsStarted = Date.now();
  let dns: ProbeResult;
  try { dns = await native.resolveDns(host); }
  catch { dns = { ok: false, code: 'DNS_FAILED', durationMs: Date.now() - dnsStarted }; }
  diagnose({ time: Date.now(), event: dns.ok ? 'success' : 'failure', mode: 'network_probe', stage: 'dns', duration: dns.durationMs, error: dns.ok ? undefined : messageFor('dns', dns.code) });
  if (!dns.ok || !dns.addresses?.length) throw new Error(messageFor('dns', dns.code));

  let connectedAddress = '';
  steps.push({ key: 'tcp', label: '正在连接 TCP 443…', run: () => native.checkTcp(dns.addresses!) });
  steps.push({ key: 'tls', label: '正在验证 TLS…', run: () => native.checkTls(host, connectedAddress) });
  const results: string[] = [`DNS 解析成功 ${dns.durationMs}ms（${dns.addresses.length} 个地址）`];
  for (const step of steps) {
    onStage(step.label);
    const started = Date.now();
    let result: ProbeResult;
    try { result = await step.run(); }
    catch { result = { ok: false, code: `${step.key.toUpperCase()}_FAILED`, durationMs: Date.now() - started }; }
    const message = result.ok ? `${step.key.toUpperCase()} 连接成功 ${result.durationMs}ms` : messageFor(step.key, result.code);
    diagnose({ time: Date.now(), event: result.ok ? 'success' : 'failure', mode: 'network_probe', stage: step.key, duration: result.durationMs, error: result.ok ? undefined : message });
    if (!result.ok) throw new Error(message);
    if (step.key === 'tcp' && result.address) connectedAddress = result.address;
    results.push(message);
  }
  return results.join('\n');
}
