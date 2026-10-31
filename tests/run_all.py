#!/usr/bin/env python3
"""Run every end-to-end test against the built app.   python tools/build.py && python tests/run_all.py"""
import glob, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__)); failed = []
for t in sorted(glob.glob(os.path.join(here, 'e2e', 'test_*.py'))):
    print('\n==', os.path.basename(t))
    if subprocess.run([sys.executable, t], cwd=os.path.join(here, 'e2e')).returncode: failed.append(os.path.basename(t))
print('\n' + ('ALL TESTS PASSED' if not failed else 'FAILED: ' + ', '.join(failed)))
sys.exit(1 if failed else 0)
