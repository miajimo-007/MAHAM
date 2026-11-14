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
try { localStorage.setItem('bct.test.nowhatsnew', '1'); } catch (e) {}   // the "What's new" window would cover the page (test_whats_new turns it back on)
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
    async def open_watch(self):   # calm desks (2026.11.13.6): open every Watch line, then the page text
        await self.js("document.querySelectorAll('.dc-wl').forEach(w => w.classList.add('open'))"); return await self.page.inner_text('#main')
    async def sign_in_as(self, member_id, mode='admin'): await self.js(f"App.setMe('{member_id}'); App.mode = '{mode}'; App.launch()"); await self.page.wait_for_timeout(350)

async def sign_in_page(page, member_id, pin='1234'):
    """the login page: employee ID (or the user name, while no employee ID is set) + PIN; a first sign-in chooses the PIN"""
    await page.fill('#lid', member_id); await page.fill('#lpin', pin); await page.click('#lgo')
    await page.wait_for_selector('#lnew, #main', timeout=15000)
    if await page.locator('#lnew').count(): await page.fill('#lnew', pin); await page.fill('#lnew2', pin); await page.click('#lset')

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
            await page.goto(f'http://127.0.0.1:{port}/MAHAM.html'); await page.click('#pick'); await page.wait_for_selector('#loginf')
            await sign_in_page(page, first_user); await page.wait_for_selector('#main .kpis')
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
