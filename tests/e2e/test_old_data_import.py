"""Imports the 15 old per-sheet Excel files and checks the numbers match the original workbook.
The files contain hospital data, so they are NOT kept with the code. Point to them with:
    BCT_OLD_DATA=/path/to/folder/with/the/15/xlsx  python tests/e2e/test_old_data_import.py"""
import os, glob, sys
from harness import app_session, Check, run
FOLDER = os.environ.get('BCT_OLD_DATA', '')
async def main():
    files = sorted(glob.glob(os.path.join(FOLDER, '*.xlsx'))) if FOLDER else []
    if len(files) < 15: print('SKIP old data import — set BCT_OLD_DATA to the folder with the 15 sheet files'); return
    c = Check('old data import matches the workbook')
    async with app_session() as s:
        pg = s.page
        await s.go('#/importdata'); await pg.set_input_files('#impfiles', files); await pg.wait_for_selector('#impgo2', timeout=180000)
        await pg.click('#impgo2'); await pg.wait_for_timeout(3000)
        k = await s.js("Calc.kpis(2026)")
        c('team score 93.8 (Dashboard sheet)', round(k['teamScore'], 1) == 93.8, k['teamScore'])
        ytd = await s.js("Object.fromEntries(Calc.heatmap(2026).rows.map(r => [r.m.id, Math.round(r.avg * 100) / 100]))")
        want = [96.88, 96.8, 95.3, 92.71, 92.33, 88.87]
        c('per-person YTD averages', sorted(ytd.values(), reverse=True) == want, ytd)
        n = await s.js("[Store.all('todo').length, Store.all('helpdesk').length]")
        c('record counts', n == [1042, 939], n)
        await s.go('#/home'); await s.go('#/importdata'); await pg.set_input_files('#impfiles', files); await pg.wait_for_selector('#impgo2', timeout=180000)
        await pg.click('#impgo2'); await pg.wait_for_timeout(3000)
        c('importing again does not duplicate', await s.js("Store.all('todo').length") == 1042)
        c.done(s)
run(main())
