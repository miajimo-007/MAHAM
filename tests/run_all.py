#!/usr/bin/env python3
"""Run every end-to-end test against the built app.   python tools/build.py && python tests/run_all.py [-j N]
Tests run side by side (default 4 at a time; -j 1 = one after another). Each test has its own browser and its own
private folder, so they cannot disturb each other.
A test that fails is run once more on its own, after the others: browser tests can time out once on a busy machine.
A test that fails twice is a real failure."""
import glob, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')   # ✓ / ✗ on Windows consoles and log files
except AttributeError: pass
here = os.path.dirname(os.path.abspath(__file__)); e2e = os.path.join(here, 'e2e')
jobs = 4
if '-j' in sys.argv:
    try: jobs = max(1, int(sys.argv[sys.argv.index('-j') + 1]))
    except (IndexError, ValueError): sys.exit('usage: run_all.py [-j N]')
env = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8')   # ✓ / ✗ print on Windows too

def run(t):
    p = subprocess.run([sys.executable, t], cwd=e2e, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return t, p.returncode, p.stdout + p.stderr

tests = sorted(glob.glob(os.path.join(e2e, 'test_*.py'))); first_fail = []; t0 = time.time()
with ThreadPoolExecutor(max_workers=jobs) as pool:
    for f in as_completed([pool.submit(run, t) for t in tests]):
        t, code, out = f.result()
        print(f'\n== {os.path.basename(t)}\n{out.rstrip()}', flush=True)
        if code: first_fail.append(t)
failed = []
for t in sorted(first_fail):   # once more, alone
    print(f'\n== {os.path.basename(t)} — once more, on its own', flush=True)
    _, code, out = run(t); print(out.rstrip(), flush=True)
    if code: failed.append(os.path.basename(t))
print(f'\n{len(tests)} tests in {int(time.time() - t0) // 60} min · ' + ('ALL TESTS PASSED' if not failed else 'FAILED: ' + ', '.join(failed)))
sys.exit(1 if failed else 0)
