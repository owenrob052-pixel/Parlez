#!/usr/bin/env python3
"""Builds words.js from compact pipe-delimited data files, deduplicating by French word."""
import glob, os

words = []
seen_fr = set()
data_dir = os.path.join(os.path.dirname(__file__), 'word_data')
for f in sorted(glob.glob(os.path.join(data_dir, '*.txt'))):
    with open(f) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split('|')
            if len(parts) >= 2:
                fr, en = parts[0].strip(), parts[1].strip()
                hint = parts[2].strip() if len(parts) > 2 else ''
                if fr.lower() not in seen_fr:
                    seen_fr.add(fr.lower())
                    words.append((fr, en, hint))

with open(os.path.join(os.path.dirname(__file__), 'words.js'), 'w') as out:
    out.write('// Auto-generated — do not edit. Run build_words.py to regenerate.\n')
    out.write('const FRENCH_WORDS = [\n')
    for fr, en, hint in words:
        fr_esc = fr.replace("'", "\\'")
        en_esc = en.replace("'", "\\'")
        hint_esc = hint.replace("'", "\\'")
        if hint:
            out.write(f"  {{fr:'{fr_esc}',en:'{en_esc}',hint:'{hint_esc}'}},\n")
        else:
            out.write(f"  {{fr:'{fr_esc}',en:'{en_esc}'}},\n")
    out.write('];\n')

print(f'Generated words.js with {len(words)} unique words.')
