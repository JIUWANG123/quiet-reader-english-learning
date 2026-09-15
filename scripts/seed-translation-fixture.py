"""Seed only a pulled emulator fixture database; never ships or calls an AI API."""
import hashlib
import json
import sqlite3
import sys
import time

db = sqlite3.connect(sys.argv[1])
config = dict(baseUrl='https://api.deepseek.com', model='deepseek-chat', temperature=0.2)
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
for chapter in range(1, 9):
    paragraphs = [f'Section {chapter}, paragraph {i}. She found herself strangely reluctant to leave. The room was quiet and the window was open. He regarded her with suspicion. The children were taking their books to the station.' for i in range(1, 101)]
    for index, target in enumerate(paragraphs):
        previous = '\n\n'.join(paragraphs[max(0, index-2):index])[-2200:]
        following = '\n\n'.join(paragraphs[index+1:index+3])[:2200]
        key = hashlib.sha256(encode([4, config, 'chapter', target, previous, following]).encode()).hexdigest()
        translation = '\n'.join(f'译文第{line}行：她发现自己有些不愿离开，房间很安静，窗户开着。' for line in range(1, 51))
        db.execute('INSERT OR REPLACE INTO ai_cache VALUES(?,?,?,?,?,?)', (key, 'chapter', target, encode(dict(translation=translation)), config['model'], int(time.time()*1000)))
db.commit()
db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
db.close()
print('Seeded 800 deterministic long translations in emulator fixture database')
