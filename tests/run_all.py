#!/usr/bin/env python3
"""Run every end-to-end test against the built app.   python tools/build.py && python tests/run_all.py
A test that fails is run once more on its own: browser tests can time out once on a slow or busy machine.
A test that fails twice is a real failure."""
import glob, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__)); e2e = os.path.join(here, 'e2e'); failed = []
def run(t): return subprocess.run([sys.executable, t], cwd=e2e).returncode
for t in sorted(glob.glob(os.path.join(e2e, 'test_*.py'))):
    print('\n==', os.path.basename(t))
    if run(t):
        print(f'\n== {os.path.basename(t)} — once more')
        if run(t): failed.append(os.path.basename(t))
print('\n' + ('ALL TESTS PASSED' if not failed else 'FAILED: ' + ', '.join(failed)))
sys.exit(1 if failed else 0)
