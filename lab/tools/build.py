#!/usr/bin/env python3
"""Build MAHAM Lab: inline lab.html (MAHAM's data code + the Lab's own files) into dist/MAHAM-Lab.html.
MAHAM itself is not touched — its source is only read."""
import os, re, sys, subprocess, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
def read(rel):
    with open(os.path.normpath(os.path.join(ROOT, rel)), encoding='utf-8') as f: return f.read()
html = read('lab.html')
css = re.findall(r'<link rel="stylesheet" href="([^"]+)">', html)
js = re.findall(r'<script src="([^"]+)"></script>', html)
for r in css + js:
    if not os.path.isfile(os.path.normpath(os.path.join(ROOT, r))): sys.exit('missing ' + r)
own = sorted(f'js/{f}' for f in os.listdir(os.path.join(ROOT, 'js')))
missing = set(own) - set(js)
if missing: sys.exit('not referenced: ' + ', '.join(missing))
if shutil.which('node'):
    for r in js:
        if 'vendor/' in r: continue
        p = subprocess.run(['node', '--check', os.path.normpath(os.path.join(ROOT, r))], capture_output=True, text=True)
        if p.returncode: sys.exit(f'syntax error in {r}:\n{p.stderr}')
styles = '\n'.join(f'/* ==== {os.path.basename(c)} ==== */\n' + read(c) for c in css)
html = re.sub(r'(<link rel="stylesheet" href="[^"]+">\s*)+', lambda _: f'<style>\n{styles}</style>\n', html, count=1)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>/* ==== ' + m.group(1).replace('../src/', 'app/') + ' ==== */\n' + read(m.group(1)).replace('</script', '<\\/script') + '\n</script>', html)
os.makedirs(DIST, exist_ok=True)
out = os.path.join(DIST, 'MAHAM-Lab.html')
with open(out, 'w', encoding='utf-8') as f: f.write(html)
print(f'built {out} ({os.path.getsize(out)//1024} KB, {len(js)} scripts)')
