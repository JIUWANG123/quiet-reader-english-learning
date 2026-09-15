import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { importDatabaseFromAssetAsync, openDatabaseAsync } from 'expo-sqlite';
import { ECDICTProvider, type DictionaryProvider } from './service';

type State = { provider: DictionaryProvider | null; loading: boolean; error: string };
const Context = createContext<State>({ provider: null, loading: true, error: '' });

export function DictionaryContextProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>({ provider: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    let database: Awaited<ReturnType<typeof openDatabaseAsync>> | null = null;
    (async () => {
      await importDatabaseFromAssetAsync('dictionary.db', {
        assetId: require('../../../assets/dictionary/dictionary.db'),
      });
      database = await openDatabaseAsync('dictionary.db');
      if (active) setState({ provider: new ECDICTProvider(database), loading: false, error: '' });
    })().catch(error => {
      if (active) setState({ provider: null, loading: false, error: error instanceof Error ? error.message : '词典载入失败' });
    });
    return () => { active = false; if (database) void database.closeAsync(); };
  }, []);
  const value = useMemo(() => state, [state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDictionary() {
  return useContext(Context);
}
