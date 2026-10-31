#!/usr/bin/env python3
"""Build DARRIK for the shared folder.

    python tools/build.py            # check + build dist/
    python tools/build.py --check    # only run the checks

Output
    dist/DARRIK/DARRIK.html   the whole app in ONE file (this is what goes in the shared folder)
    dist/DARRIK/READ ME FIRST.txt
    dist/DARRIK/DARRIK Data/  empty data folder (users/, Import/) for a first install
    dist/DARRIK_App_<version>.zip

Checks (build stops if any fails)
    - every file referenced by src/index.html exists
    - every .js / .css file under src/ is referenced exactly once (no forgotten or orphan files)
    - every JavaScript file passes `node --check` (when Node.js is installed)
"""
import os, re, sys, shutil, subprocess, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
PKG = os.path.join(DIST, 'DARRIK')
APP_FILE = 'DARRIK.html'

def fail(msg):
    print('BUILD FAILED:', msg); sys.exit(1)

def read(rel):
    with open(os.path.join(SRC, rel), encoding='utf-8') as f: return f.read()

def check():
    html = read('index.html')
    css = re.findall(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', html)
    js = re.findall(r'<script src="([^"]+)"></script>', html)
    refs = css + js
    for r in refs:
        if not os.path.isfile(os.path.join(SRC, r)): fail('missing file: ' + r)
    dup = {r for r in refs if refs.count(r) > 1}
    if dup: fail('referenced twice: ' + ', '.join(sorted(dup)))
    on_disk = set()
    for d, _, files in os.walk(SRC):
        for f in files:
            if f.endswith(('.js', '.css')): on_disk.add(os.path.relpath(os.path.join(d, f), SRC).replace(os.sep, '/'))
    orphans = on_disk - set(refs)
    if orphans: fail('not referenced by index.html: ' + ', '.join(sorted(orphans)))
    if shutil.which('node'):
        for r in js:
            if r.startswith('vendor/'): continue
            p = subprocess.run(['node', '--check', os.path.join(SRC, r)], capture_output=True, text=True)
            if p.returncode: fail(f'syntax error in {r}:\n{p.stderr}')
    else:
        print('note: Node.js not found — skipped JavaScript syntax check')
    m = re.search(r"APP_VERSION = '([^']+)'", read('js/config/app-config.js'))
    if not m: fail('APP_VERSION not found in js/config/app-config.js')
    print(f'checks ok — {len(css)} stylesheets, {len(js)} scripts, version {m.group(1)}')
    return html, css, js, m.group(1)

def bundle(html, css, js):
    """inline every stylesheet and script into one self-contained HTML file"""
    styles = '\n'.join(f'/* ==== {c} ==== */\n' + read(c) for c in css)
    html = re.sub(r'(<link rel="stylesheet" href="[^"]+"\s*/?>\s*)+', lambda _: f'<style>\n{styles}</style>\n', html, count=1)
    def script(m):
        code = read(m.group(1)).replace('</script', '<\\/script')
        return f'<script>/* ==== {m.group(1)} ==== */\n{code}\n</script>'
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    html = re.sub(r'<!-- Scripts load in dependency order.*?-->\n', '', html, flags=re.S)
    return html

def build():
    html, css, js, version = check()
    shutil.rmtree(DIST, ignore_errors=True)
    for d in ('DARRIK Data/users', 'DARRIK Data/Import'): os.makedirs(os.path.join(PKG, d))
    with open(os.path.join(PKG, APP_FILE), 'w', encoding='utf-8') as f: f.write(bundle(html, css, js))
    shutil.copy(os.path.join(ROOT, 'tools', 'READ_ME_FIRST.txt'), os.path.join(PKG, 'READ ME FIRST.txt'))
    pub = os.path.join(ROOT, 'public')   # files served next to the app as they are (settings file, phone install files) — when present
    if os.path.isdir(pub): shutil.copytree(pub, PKG, dirs_exist_ok=True)
    zpath = os.path.join(DIST, f'DARRIK_App_{version}.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for d, dirs, files in os.walk(PKG):
            rel = os.path.relpath(d, DIST)
            if not files and not dirs: z.write(d, rel + '/')
            for f in files: z.write(os.path.join(d, f), os.path.join(rel, f))
    size = os.path.getsize(os.path.join(PKG, APP_FILE))
    print(f'built dist/DARRIK/{APP_FILE} ({size // 1024} KB) and {os.path.basename(zpath)}')

if __name__ == '__main__':
    check() if '--check' in sys.argv else build()
