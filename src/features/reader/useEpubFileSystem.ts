import {prepareEpubTemplate} from './epubTemplate';
import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {useMemo,useEffect} from 'react';
import type { ReaderProps } from '@epubjs-react-native/core';
import {activateEpubRuntime,retireEpubRuntime} from './epubRuntime';

type EpubFileSystem = ReturnType<ReaderProps['fileSystem']>;

const writeAsStringAsync: EpubFileSystem['writeAsStringAsync'] = (uri, contents, options) => FileSystem.writeAsStringAsync(uri, prepareEpubTemplate(contents), {
  encoding: options?.encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
});

// The upstream Expo adapter still imports removed root-level APIs. Keep its
// contract while routing calls through Expo's supported legacy entry point.
export function useEpubFileSystem(namespace?:string,options?:{anchor?:string|null;generateLocations?:boolean}): EpubFileSystem {
  // Each simultaneous reader writes index.html. Separate runtime folders prevent
  // a preview from replacing the active document's template during startup.
  const runtime=useMemo(()=>{
    if(!namespace)return FileSystem.documentDirectory;
    return activateEpubRuntime(namespace);
  },[namespace]);
  const runtimeDirectory=typeof runtime==='string'||runtime===null?runtime:runtime.folder.uri+'/';
  useEffect(()=>()=>{
    if(namespace&&runtime&&typeof runtime!=='string')retireEpubRuntime(namespace,runtime.token);
  },[namespace,runtime]);
  const [file, setFile] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [size, setSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const downloadFile = useCallback(async (fromUrl: string, toFile: string) => {
    setDownloading(true);
    try {
      const task = FileSystem.createDownloadResumable(
        fromUrl,
        `${FileSystem.documentDirectory}${toFile}`,
        {},
        event => setProgress(Math.round(event.totalBytesWritten / event.totalBytesExpectedToWrite * 100)),
      );
      const result = await task.downloadAsync();
      if (!result) throw new Error('Download failed');
      const info = await FileSystem.getInfoAsync(result.uri);
      if (info.exists) setSize(info.size ?? 0);
      setFile(result.uri);
      setSuccess(true);
      setError(null);
      return { uri: result.uri, mimeType: result.mimeType ?? null };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Download failed');
      return { uri: null, mimeType: null };
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    file, progress, downloading, size, error, success,
    documentDirectory: runtimeDirectory,
    cacheDirectory: FileSystem.cacheDirectory,
    bundleDirectory: FileSystem.bundleDirectory ?? undefined,
    readAsStringAsync: (uri, options) => FileSystem.readAsStringAsync(uri, {
      encoding: options?.encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    }),
    writeAsStringAsync: (uri,contents,writeOptions)=>writeAsStringAsync(uri,prepareEpubTemplate(contents,options),writeOptions),
    deleteAsync: uri => FileSystem.deleteAsync(uri, { idempotent: true }),
    downloadFile,
    getFileInfo: async uri => {
      const info = await FileSystem.getInfoAsync(uri);
      return {
        uri: info.uri,
        exists: info.exists,
        isDirectory: info.exists ? info.isDirectory : false,
        size: info.exists ? info.size : undefined,
      };
    },
  };
}
