import {Directory,File,Paths} from 'expo-file-system';
import type {EpubIndex} from '../../services/books/epubIndex';

export async function warmAdjacentChapters(bookId:string, cfi?:string){
  try{
    const root=new Directory(Paths.document,'books');
    const indexFile=new File(root,`${bookId}.epub-index.json`);
    if(!indexFile.exists)return;
    const index=JSON.parse(await indexFile.text()) as EpubIndex;
    if(!index.chapters?.length)return;
    const chapterIndex=Math.max(0,index.chapters.findIndex(ch=>cfi?.includes(ch.href))+0);
    const cache=new Directory(root,`${bookId}.chapters`);
    const targets=[chapterIndex-1,chapterIndex,chapterIndex+1].filter(i=>i>=0&&i<index.chapters.length);
    // Reading small cached XHTML files warms the OS filesystem cache without loading the book into JS state.
    await Promise.all(targets.map(i=>{const file=new File(cache,`${i}.xhtml`);return file.exists?file.text().then(()=>undefined):Promise.resolve();}));
  }catch{/* Cache is an optimization; EPUB rendering remains the fallback. */}
}
