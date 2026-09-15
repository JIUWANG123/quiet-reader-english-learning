const fs=require('fs'),path=require('path'),JSZip=require('jszip');
(async()=>{
 const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
 let items='',spine='',nav='';
 for(let c=0;c<8;c++){items+=`<item id="c${c}" href="c${c}.xhtml" media-type="application/xhtml+xml"/>`;spine+=`<itemref idref="c${c}"/>`;nav+=`<li><a href="c${c}.xhtml">Chapter ${c+1}</a></li>`;
 zip.file(`OPS/c${c}.xhtml`,`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${c+1}</title></head><body><h1>Chapter ${c+1}</h1>`+Array.from({length:100},(_,i)=>`<p>Section ${c+1}, paragraph ${i+1}. She found herself strangely reluctant to leave. The room was quiet and the window was open. He regarded her with suspicion. The children were taking their books to the station.</p>`).join('')+'</body></html>');}
 zip.file('OPS/book.opf',`<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">performance-test</dc:identifier><dc:title>Performance Test</dc:title><dc:language>en</dc:language></metadata><manifest>${items}<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine>${spine}</spine></package>`);
 zip.file('OPS/nav.xhtml',`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${nav}</ol></nav></body></html>`);
 fs.writeFileSync('../qr-build-temp-3/Performance.epub',await zip.generateAsync({type:'nodebuffer'}));
 console.log('Created original EPUB fixture with 8 chapters, 800 paragraphs');
})();
