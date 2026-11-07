"""Shared test set-up: serves dist/, replaces the folder picker with a private browser folder (OPFS),
and gives each test a signed-in page. Tests run the BUILT app (python tools/build.py first)."""
import asyncio, os, socket, subprocess, sys, time, contextlib
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP = os.path.join(ROOT, 'dist', 'MAHAM')
FIX = os.path.join(ROOT, 'tests', 'fixtures')
SHOTS = os.path.join(ROOT, 'tests', 'screenshots'); os.makedirs(SHOTS, exist_ok=True)

# the real folder picker needs a person to click; tests use a private in-browser folder instead
INIT = r"""
window.showDirectoryPicker = async () => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('MAHAM', { create: true });
};
"""

def free_port():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

class Session:
    def __init__(self, page): self.page = page; self.errors = []; page.on('pageerror', lambda e: self.errors.append(str(e)))
    async def js(self, code): return await self.page.evaluate(code)
    async def go(self, hsh, wait=350): await self.js(f"location.hash='{hsh}'"); await self.page.wait_for_timeout(wait); return await self.page.inner_text('#main')
    async def sign_in_as(self, member_id, mode='admin'): await self.js(f"App.setMe('{member_id}'); App.mode = '{mode}'; App.launch()"); await self.page.wait_for_timeout(350)

@contextlib.asynccontextmanager
async def app_session(first_user='adam'):
    if not os.path.isfile(os.path.join(APP, 'MAHAM.html')): sys.exit('Build first: python tools/build.py')
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 900}); await ctx.add_init_script(INIT)
            page = await ctx.new_page(); s = Session(page)
            await page.goto(f'http://127.0.0.1:{port}/MAHAM.html'); await page.click('#pick'); await page.wait_for_selector('[data-me]')
            await page.click(f'[data-me="{first_user}"]'); await page.wait_for_selector('#main .kpis')
            await page.evaluate("App.mode = 'admin'; App.launch()"); await page.wait_for_timeout(300)   # tests start with the super admin in Admin mode
            yield s
            await b.close()
    finally: srv.terminate()

class Check:
    """tiny assertion collector: prints each check, fails the test at the end"""
    def __init__(self, name): self.name = name; self.bad = []
    def __call__(self, label, ok, detail=''):
        print(('  ✓ ' if ok else '  ✗ ') + label + (f'  [{detail}]' if detail and not ok else ''))
        if not ok: self.bad.append(label)
    def done(self, session=None):
        if session and session.errors: self.bad.append('page errors: ' + '; '.join(session.errors[:3])); print('  ✗ page errors:', session.errors[:3])
        if self.bad: print(f'FAIL {self.name}: {len(self.bad)} check(s) failed'); sys.exit(1)
        print(f'PASS {self.name}')

def run(coro): asyncio.run(coro)
