const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),JSZip=require('jszip');
const root=fs.mkdtempSync(path.resolve('../qr-build-temp-3/resources-test-'));
let archiveReads=0;
class File {
 constructor(...parts){this.uri=path.join(...parts.map(p=>typeof p==='string'?p:p.uri));}
 get name(){return path.basename(this.uri)}get size(){return fs.statSync(this.uri).size}get modificationTime(){return fs.statSync(this.uri).mtimeMs}get exists(){return fs.existsSync(this.uri)}
 async arrayBuffer(){archiveReads++;const b=fs.readFileSync(this.uri);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}
 async text(){return fs.promises.readFile(this.uri,'utf8')}write(data){fs.writeFileSync(this.uri,data)}
}
class Directory {constructor(...parts){this.uri=path.join(...parts.map(p=>typeof p==='string'?p:p.uri))}create(){fs.mkdirSync(this.uri,{recursive:true})}}
const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync('src/features/reader/epubResources.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(out,name=>name==='expo-file-system'?{File,Directory,Paths:{cache:root}}:require(name));
(async()=>{try{
 const zip=new JSZip();zip.file('META-INF/container.xml','<container><rootfile full-path="OPS/book.opf"/></container>');zip.file('OPS/book.opf','<package/>');zip.file('OPS/chapters/one.xhtml','<p>Keep original CFI structure.</p>');zip.file('OPS/images/one.png',new Uint8Array([0,1,255]));
 const source=path.join(root,'fixture.epub');fs.writeFileSync(source,await zip.generateAsync({type:'nodebuffer'}));
 const [a,b]=await Promise.all([out.prepareEpubResources(source),out.prepareEpubResources(source)]);assert.equal(a,b);assert.equal(archiveReads,1);
 assert.equal(fs.readFileSync(path.join(path.dirname(a),'chapters/one.xhtml'),'utf8'),'<p>Keep original CFI structure.</p>');
 assert.deepEqual([...fs.readFileSync(path.join(path.dirname(a),'images/one.png'))],[0,1,255]);
 assert.equal(await out.prepareEpubResources(source),a);assert.equal(archiveReads,1,'warm reopen must not read archive');
 fs.unlinkSync(path.join(path.dirname(a),'chapters/one.xhtml'));await out.prepareEpubResources(source);assert.equal(archiveReads,2,'missing chapter must rebuild cache');archiveReads=1;
 zip.file('OPS/chapters/two.xhtml','<p>Updated book.</p>');fs.writeFileSync(source,await zip.generateAsync({type:'nodebuffer'}));await out.prepareEpubResources(source);assert.equal(archiveReads,2,'replacement invalidates cache');
 fs.writeFileSync(path.join(root,'epub-resources/fixture.epub/ready.json'),'{broken');await out.prepareEpubResources(source);assert.equal(archiveReads,3);
 const bad=new JSZip();bad.file('META-INF/container.xml','<rootfile full-path="../outside.opf"/>');bad.file('../outside.opf','bad');const badPath=path.join(root,'bad.epub');fs.writeFileSync(badPath,await bad.generateAsync({type:'nodebuffer'}));await assert.rejects(()=>out.prepareEpubResources(badPath));
 console.log('PASS: unpacked resources retain bytes/paths; concurrent extraction deduplicates; warm reopen skips archive; replacement and corrupt marker rebuild; traversal rejected.');
}finally{if(root.startsWith(path.resolve('../qr-build-temp-3')+path.sep))fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
