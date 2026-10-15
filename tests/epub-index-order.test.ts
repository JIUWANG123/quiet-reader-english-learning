import {test} from 'node:test';import assert from 'node:assert/strict';import JSZip from 'jszip';import {buildEpubIndex} from '../src/services/books/epubIndex';

const file=(zip:JSZip)=>({arrayBuffer:async()=>await zip.generateAsync({type:'arraybuffer'})}) as any;

// XML gives attribute order no meaning. Calibre, Sigil and ePubLibre all emit
// href before id, which the original single-regex parser could not see at all.
test('EPUB index reads manifest items with href before id',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
 zip.file('OEBPS/book.opf','<package version="2.0"><manifest><item href="Text/a.xhtml" id="a" media-type="application/xhtml+xml"/><item media-type="application/xhtml+xml" id="b" href="Text/b.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
 zip.file('OEBPS/Text/a.xhtml','<p>Alpha</p>');
 zip.file('OEBPS/Text/b.xhtml','<p>Beta</p>');
 const index=await buildEpubIndex(file(zip));
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['OEBPS/Text/a.xhtml','OEBPS/Text/b.xhtml']);
 assert.deepEqual(index.chapters.map(chapter=>chapter.index),[0,1]);
});

test('EPUB index keeps the original id-before-href order working',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<rootfile full-path="OEBPS/book.opf"/>');
 zip.file('OEBPS/book.opf','<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
 zip.file('OEBPS/a.xhtml','<p>A</p>');
 zip.file('OEBPS/b.xhtml','<p>B</p>');
 const written=new Map<string,string>();
 const index=await buildEpubIndex(file(zip),{file:(name:string)=>({write:(value:string)=>written.set(name,value)}) as any});
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['OEBPS/a.xhtml','OEBPS/b.xhtml']);
 assert.equal(written.get('0.xhtml'),'<p>A</p>');
 assert.equal(written.get('1.xhtml'),'<p>B</p>');
});

test('EPUB index recovers a reading order from the manifest when the spine is missing',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<rootfile full-path="book.opf"/>');
 zip.file('book.opf','<package><manifest><item href="one.xhtml" id="one" media-type="application/xhtml+xml"/><item href="two.xhtml" id="two" media-type="application/xhtml+xml"/></manifest></package>');
 zip.file('one.xhtml','<p>One</p>');
 zip.file('two.xhtml','<p>Two</p>');
 const index=await buildEpubIndex(file(zip));
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['one.xhtml','two.xhtml']);
});

test('EPUB index skips unreachable and empty documents instead of inventing chapters',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<rootfile full-path="book.opf"/>');
 zip.file('book.opf','<package><manifest><item href="real.xhtml" id="real"/><item href="missing.xhtml" id="missing"/><item href="empty.xhtml" id="empty"/></manifest><spine><itemref idref="missing"/><itemref idref="real"/><itemref idref="empty"/><itemref idref="unknown"/></spine></package>');
 zip.file('real.xhtml','<p>Real</p>');
 zip.file('empty.xhtml','   ');
 const index=await buildEpubIndex(file(zip));
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['real.xhtml']);
});

test('EPUB index follows the EPUB 3 nav document when the spine is unusable',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<rootfile full-path="OPS/book.opf"/>');
 zip.file('OPS/book.opf','<package version="3.0"><manifest><item href="nav.xhtml" id="nav" properties="nav" media-type="application/xhtml+xml"/><item href="c1.xhtml" id="c1" media-type="application/xhtml+xml"/><item href="c2.xhtml" id="c2" media-type="application/xhtml+xml"/></manifest><spine/></package>');
 zip.file('OPS/nav.xhtml','<nav><ol><li><a href="c1.xhtml">One</a></li><li><a href="c2.xhtml">Two</a></li></ol></nav>');
 zip.file('OPS/c1.xhtml','<p>One</p>');
 zip.file('OPS/c2.xhtml','<p>Two</p>');
 const index=await buildEpubIndex(file(zip));
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['OPS/c1.xhtml','OPS/c2.xhtml']);
});

test('EPUB index ignores linear="no" spine items',async()=>{
 const zip=new JSZip();
 zip.file('META-INF/container.xml','<rootfile full-path="book.opf"/>');
 zip.file('book.opf','<package><manifest><item href="main.xhtml" id="main"/><item href="aside.xhtml" id="aside"/></manifest><spine><itemref idref="main"/><itemref idref="aside" linear="no"/></spine></package>');
 zip.file('main.xhtml','<p>Main</p>');
 zip.file('aside.xhtml','<p>Aside</p>');
 const index=await buildEpubIndex(file(zip));
 assert.deepEqual(index.chapters.map(chapter=>chapter.href),['main.xhtml']);
});
