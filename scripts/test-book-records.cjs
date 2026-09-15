const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const source=ts.createSourceFile('records.tsx',fs.readFileSync('src/features/reader/BookRecords.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const queries={};
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='queries'){
  for(const property of node.initializer.properties)queries[property.name.getText(source)]=property.initializer.text;
 }
 ts.forEachChild(node,visit);
}
visit(source);
assert.deepEqual(Object.keys(queries).sort(),['notes','sentences','words']);
const db=new DatabaseSync(':memory:');
const schema={};new Function('exports',ts.transpileModule(fs.readFileSync('src/db/schema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(schema);
db.exec(schema.schema);
for(const id of ['a','b']){
 db.prepare("INSERT INTO books(id,title,format,file_name,created_at) VALUES(?,?,'epub',?,1)").run(id,id,id);
 db.prepare('INSERT INTO sentence_notes VALUES(?,?,?,?,?,?,?)').run(id,'epub:1',1,10,'original '+id,'note '+id,1);
 db.prepare('INSERT INTO saved_sentences(book_id,text,context,created_at) VALUES(?,?,?,1)').run(id,'sentence '+id,'paragraph '+id);
 db.prepare("INSERT INTO text_marks(book_id,lemma,style,color,contextual_meaning,created_at) VALUES(?,?,'highlight','#fff',?,1)").run(id,'word '+id,'meaning '+id);
}
for(const query of Object.values(queries)){
 const rows=db.prepare(query).all('a');assert.equal(rows.length,1);assert.ok(rows[0].title.endsWith('a'));assert.ok(rows[0].detail.endsWith('a'));
 assert.equal(db.prepare(query).all('missing').length,0);
}
assert.equal(db.prepare('SELECT count(*) n FROM sentence_notes').get().n,2);
db.close();console.log('PASS: actual record-panel queries isolate books, retain notes and handle empty books');
