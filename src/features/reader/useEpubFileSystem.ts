import {prepareEpubTemplate} from './epubTemplate';
import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {Directory,Paths} from 'expo-file-system';
import {useMemo} from 'react';
import type { ReaderProps } from '@epubjs-react-native/core';

type EpubFileSystem = ReturnType<ReaderProps['fileSystem']>;

const writeAsStringAsync: EpubFileSystem['writeAsStringAsync'] = (uri, contents, options) => FileSystem.writeAsStringAsync(uri, prepareEpubTemplate(contents), {
  encoding: options?.encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
});

/** Cold-start cleanup is safe because no WebView exists yet. Never delete these
 * files while the process is alive: Chromium shares a renderer across readers,
 * and removing a retired reader's runtime directory can still crash it after a
 * new mode has mounted. */
export function cleanupEpubPageRuntimes(){
 const scope=globalThis as typeof globalThis & {__qrEpubRuntimeCleanup?:boolean};
 if(scope.__qrEpubRuntimeCleanup)return;
 scope.__qrEpubRuntimeCleanup=true;
 try{const root=new Directory(Paths.cache,'epub-pages');if(root.exists)root.delete();}catch{/* Cache cleanup can wait for the OS. */}
}

// The upstream Expo adapter still imports removed root-level APIs. Keep its
// contract while routing calls through Expo's supported legacy entry point.
export function useEpubFileSystem(namespace?:string,options?:{anchor?:string|null;generateLocations?:boolean}): EpubFileSystem {
  // Each simultaneous reader writes index.html. Separate runtime folders prevent
  // a preview from replacing the active document's template during startup.
  const runtimeDirectory=useMemo(()=>{
    if(!namespace)return FileSystem.documentDirectory;
    if(!/^[a-zA-Z0-9_-]+$/.test(namespace))throw new Error('Invalid reader runtime namespace');
    const folder=new Directory(Paths.cache,'epub-pages',namespace);
    folder.create({intermediates:true,idempotent:true});
    return folder.uri+'/';
  },[namespace]);
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
