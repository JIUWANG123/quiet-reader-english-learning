import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReaderSettings } from '../../types';
import { defaults, palettes, parseSettings } from './model';

const Context = createContext({ settings: defaults, colors: palettes.paper, update: (_value: Partial<ReaderSettings>) => {}, error: '' });
export function SettingsProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState(defaults);
  const [error, setError] = useState('');
  const current = useRef(defaults);
  const writes = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    db.getFirstAsync<{value: string}>('SELECT value FROM settings WHERE key=?', 'reader').then(row => {
      if (active) { current.current = parseSettings(row?.value); setSettings(current.current); }
    }).catch(() => { if (active) setError('阅读设置读取失败，暂时使用默认排版。'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [db]);
  function update(value: Partial<ReaderSettings>) {
    const next = parseSettings(JSON.stringify({ ...current.current, ...value }));
    current.current = next;
    setSettings(next);
    writes.current = writes.current.then(async () => {
      await db.runAsync('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'reader', JSON.stringify(next));
      setError('');
    }).catch(() => setError('设置保存失败，请再次调整重试。'));
  }
  if (!ready) return null;
  return <Context.Provider value={{ settings, colors: palettes[settings.theme], update, error }}>{children}</Context.Provider>;
}
export const useSettings = () => useContext(Context);
