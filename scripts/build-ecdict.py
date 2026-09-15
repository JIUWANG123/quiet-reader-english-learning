import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "ECDICT"
OUTPUT_DIR = ROOT / "assets" / "dictionary"
OUTPUT = OUTPUT_DIR / "dictionary.db"


def clean(value: str | None) -> str | None:
    value = value.strip() if value else ""
    return value or None


def build() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.unlink(missing_ok=True)
    connection = sqlite3.connect(OUTPUT)
    connection.executescript("""
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = MEMORY;
      CREATE TABLE entries (
        word TEXT PRIMARY KEY COLLATE NOCASE,
        phonetic TEXT, definition TEXT, translation TEXT, pos TEXT,
        bnc INTEGER, frq INTEGER, exchange TEXT
      ) WITHOUT ROWID;
      CREATE TABLE lemmas (
        form TEXT PRIMARY KEY COLLATE NOCASE,
        lemma TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    """)

    insert_entry = """INSERT OR IGNORE INTO entries
      (word, phonetic, definition, translation, pos, bnc, frq, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)"""
    batch: list[tuple] = []
    with (SOURCE / "ecdict.csv").open("r", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            word = clean(row.get("word"))
            if not word:
                continue
            batch.append((word, clean(row.get("phonetic")), clean(row.get("definition")),
                          clean(row.get("translation")), clean(row.get("pos")),
                          int(row["bnc"]) if row.get("bnc", "").isdigit() else None,
                          int(row["frq"]) if row.get("frq", "").isdigit() else None,
                          clean(row.get("exchange"))))
            if len(batch) >= 5000:
                connection.executemany(insert_entry, batch)
                batch.clear()
    connection.executemany(insert_entry, batch)

    lemma_rows: list[tuple[str, str]] = []
    with (SOURCE / "lemma.en.txt").open("r", encoding="utf-8-sig") as source:
        for raw in source:
            line = raw.strip()
            if not line or line.startswith(";") or " -> " not in line:
                continue
            left, variants = line.split(" -> ", 1)
            lemma = left.rsplit("/", 1)[0].strip().lower()
            if not lemma:
                continue
            lemma_rows.append((lemma, lemma))
            lemma_rows.extend((form.strip().lower(), lemma) for form in variants.split(",") if form.strip())
            if len(lemma_rows) >= 5000:
                connection.executemany("INSERT OR IGNORE INTO lemmas(form, lemma) VALUES (?, ?)", lemma_rows)
                lemma_rows.clear()
    connection.executemany("INSERT OR IGNORE INTO lemmas(form, lemma) VALUES (?, ?)", lemma_rows)
    connection.executemany("INSERT INTO metadata(key, value) VALUES (?, ?)", [
        ("source", "skywind3000/ECDICT"),
        ("source_commit", "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"),
        ("license", "MIT"),
        ("schema_version", "1"),
    ])
    connection.commit()
    connection.execute("VACUUM")
    entry_count = connection.execute("SELECT count(*) FROM entries").fetchone()[0]
    lemma_count = connection.execute("SELECT count(*) FROM lemmas").fetchone()[0]
    connection.close()
    (OUTPUT_DIR / "ECDICT-LICENSE.txt").write_text((SOURCE / "LICENSE").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Built {OUTPUT}: {entry_count} entries, {lemma_count} lemma forms")


if __name__ == "__main__":
    try:
        build()
    except Exception as error:
        print(error, file=sys.stderr)
        raise
