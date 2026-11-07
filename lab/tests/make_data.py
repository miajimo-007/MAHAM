"""Made-up team data for testing the Lab: a year of help desk, shadow work, To Dos, quick wins, good catches, on-call,
Central follow-ups and personal tasks, with a few real-looking themes hidden inside (some rising, one already fixed)."""
import json, random, hashlib, datetime as dt

random.seed(42)
TODAY = dt.date.today()
START = TODAY - dt.timedelta(days=365)
ANALYSTS = {'yousef': 'Qahtani Yousef A', 'layla': 'Harbi, Layla T', 'sara': 'Zahrani Sara F', 'adam': 'NASSER, ADAM', 'nora': 'ALGHAMDI, NORA', 'fahad': 'ALOTAIBI, FAHAD'}
DEPTS = ['Pharmacy', 'Nursing Ward 3', 'Nursing Ward 5', 'Emergency', 'OR', 'Radiology', 'Laboratory', 'Outpatient Clinics', 'ICU', 'Medical Records']
GROUPS = ['EHR APPS', 'EHR Pharmacy', 'EHR Nursing', 'EHR OR', 'EHR Reports', 'EHR L2']

# themes: (subject variants, departments, group, weight per day at start, weight at end, shadow variants, catch variants)
THEMES = [
    (['Pharmacy labels not printing', 'Label printer in pharmacy not printing labels', 'Reprint labels pharmacy please', 'pharmacy label printing failed', 'Labels not coming out - pharmacy dispensing'], ['Pharmacy'], 'EHR Pharmacy', 0.6, 2.2,
     ['Reprinting pharmacy labels manually', 'Helped pharmacy reprint labels'], ['Label printer queue stuck in pharmacy', 'Pharmacy label template cuts the drug name']),
    (['Order set not loading', 'Order set does not open for physician', 'Ordersets slow to load in ward', 'OS not loading on admission', 'order set fails to open'], ['Nursing Ward 3', 'Nursing Ward 5', 'ICU', 'Emergency'], 'EHR APPS', 1.2, 1.3,
     ['Fixed order set for ward doctors', 'Order set troubleshooting with ICU'], ['Order set favourites missing after update']),
    (['MAR not showing medication', 'Medication administration record not displaying drug', 'MAR missing doses for nurse', 'MAR display issue ward 5'], ['Nursing Ward 3', 'Nursing Ward 5'], 'EHR Nursing', 0.8, 0.9,
     ['Helped nurses with MAR display'], ['MAR hides PRN doses after midnight']),
    (['How to reset password', 'Password reset please', 'Cannot log in - password expired', 'how to change my password in ehr', 'Login problem password'], DEPTS, 'EHR L2', 1.0, 1.0, [], []),
    (['OR booking slot overlap', 'Operating room booking shows double slot', 'OR schedule overlapping cases', 'OR direct booking overlap'], ['OR'], 'EHR OR', 0.25, 0.7,
     ['OR booking overlap investigation'], ['OR booking allows two cases in one slot']),
    (['ER triage form freezes', 'Emergency triage form hanging', 'Triage form stuck when saving', 'ER triage slow'], ['Emergency'], 'EHR APPS', 0.9, 0.15,   # fixed by a quick win half-way (falls)
     ['Triage form workaround for ER'], []),
    (['Need monthly OR utilisation report', 'Report request: discharge summary report', 'Please create a report of admissions', 'Report not matching numbers'], ['OR', 'Medical Records', 'Outpatient Clinics'], 'EHR Reports', 0.4, 0.45,
     ['Prepared monthly report for OR'], []),
]
NOISE = ['Printer not working', 'Add new user', 'Change user role', 'Clinic schedule change', 'Add physician to clinic', 'Lab result not crossing to chart', 'Radiology order missing', 'Cannot find patient appointment', 'Request new template', 'Screen layout question', 'Signature not saving', 'Discharge summary error', 'Duplicate order alert', 'Allergy alert not firing', 'Bed board not updating']

def ts(d, h=10): return int(dt.datetime(d.year, d.month, d.day, h, random.randint(0, 59)).timestamp() * 1000)
def iso(d): return d.isoformat()
def pin_hash(p): return hashlib.sha256(('bct:' + p).encode()).hexdigest()

files = {}
def add(fname, rec, by):
    rec.setdefault('_by', by); rec.setdefault('_v', '2026.11.04.3')
    files.setdefault(fname, []).append(rec)

n_hd = 0
day = START
while day <= TODAY:
    if day.weekday() not in (4, 5):   # Fri / Sat off
        frac = (day - START).days / 365
        for ti, (subs, deps, grp, w0, w1, shs, gcs) in enumerate(THEMES):
            w = w0 + (w1 - w0) * frac
            if ti == 5 and frac > 0.55: w = 0.15
            k = int(w) + (1 if random.random() < w - int(w) else 0)
            # one spike: pharmacy labels, 20 days ago
            if ti == 0 and (TODAY - day).days == 20: k += 12
            for _ in range(k):
                n_hd += 1; tech = random.choice(list(ANALYSTS)); hrs = round(random.uniform(0.5, 30) * (3 if ti == 4 else 1), 2)
                created = dt.datetime(day.year, day.month, day.day, random.randint(7, 15), random.randint(0, 59)); res = created + dt.timedelta(hours=hrs)
                closed = (TODAY - day).days > 3 or random.random() < 0.6
                add(f'apps-mgr.hd-{day.year}-{day.month:02d}.json', {'id': f'hd-{900000 + n_hd}', 'c': 'helpdesk', 'reqId': 900000 + n_hd, 'subject': random.choice(subs), 'department': random.choice(deps), 'group': grp, 'technician': ANALYSTS[tech], 'requester': random.choice(['Nurse Hala', 'Dr. Sami', 'Pharmacist Noor', 'Clerk Fahad', 'Dr. Lina', 'Nurse Omar', 'Tech Reem']), 'status': 'Closed' if closed else 'Open', 'created': created.strftime('%Y-%m-%dT%H:%M'), 'resolved': res.strftime('%Y-%m-%dT%H:%M') if closed else '', 'elapsedHrs': hrs if closed else None, 'team': 'apps', '_ts': ts(day)}, 'apps-mgr')
            if shs and random.random() < w * 0.25:
                a = random.choice(list(ANALYSTS)); add(f'{a}.json', {'id': f'sw-{a}-{ti}-{day}', 'c': 'shadow', 'analyst': a, 'team': 'apps', 'date': iso(day), 'subject': random.choice(shs), 'minutes': random.choice([20, 30, 45, 60]), 'taskType': 'PHARMACY >> Troubleshooting' if ti == 0 else 'NURSING >> Troubleshooting' if ti in (1, 2) else 'PA >> Troubleshooting', 'source': 'Phone', '_ts': ts(day)}, a)
            if gcs and random.random() < 0.01 + w * 0.01:
                a = random.choice(list(ANALYSTS)); st = random.choice(['New', 'New', 'In progress', 'Resolved'])
                add(f'{a}.json', {'id': f'gc-{a}-{ti}-{day}', 'c': 'gcatch', 'title': random.choice(gcs), 'kind': 'Issue', 'impact': 'Medium', 'system': grp.replace('EHR ', ''), 'where': deps[0], 'found': iso(day), 'status': st, 'createdBy': a, 'team': 'apps', '_ts': ts(day)}, a)
        for _ in range(random.randint(4, 8)):
            n_hd += 1; tech = random.choice(list(ANALYSTS)); hrs = round(random.uniform(0.2, 40), 2); created = dt.datetime(day.year, day.month, day.day, random.randint(7, 15), random.randint(0, 59)); res = created + dt.timedelta(hours=hrs)
            add(f'apps-mgr.hd-{day.year}-{day.month:02d}.json', {'id': f'hd-{900000 + n_hd}', 'c': 'helpdesk', 'reqId': 900000 + n_hd, 'subject': random.choice(NOISE), 'department': random.choice(DEPTS), 'group': random.choice(GROUPS), 'technician': ANALYSTS[tech], 'requester': 'User ' + str(random.randint(1, 80)), 'status': 'Closed', 'created': created.strftime('%Y-%m-%dT%H:%M'), 'resolved': res.strftime('%Y-%m-%dT%H:%M'), 'elapsedHrs': hrs, 'team': 'apps', '_ts': ts(day)}, 'apps-mgr')
        # other shadow work
        for a in ANALYSTS:
            if random.random() < 0.35: add(f'{a}.json', {'id': f'sw-{a}-x-{day}', 'c': 'shadow', 'analyst': a, 'team': 'apps', 'date': iso(day), 'subject': random.choice(['Clinic round', 'Super-user meeting', 'Training new nurses', 'Build review', 'Testing change request']), 'minutes': random.choice([30, 45, 60, 90]), 'taskType': random.choice(['PA >> Meeting', 'NURSING >> Training & Edu', 'PHYSICIAN >> Testing']), 'source': 'Visit', '_ts': ts(day)}, a)
        # on-call
        if random.random() < 0.08:
            a = random.choice(list(ANALYSTS)); add(f'{a}.json', {'id': f'oc-{a}-{day}', 'c': 'oncall', 'analyst': a, 'team': 'apps', 'date': iso(day), 'time': '02:30', 'issue': random.choice(['Pharmacy label printer down at night', 'Order set not loading in ICU night shift', 'Interface down - lab results', 'ER triage form freezes']), 'action': 'Restarted service', 'status': 'resolved', '_ts': ts(day, 22)}, a)
    day += dt.timedelta(days=1)

# To Dos from the manager: lateness grows with open load and length
open_until = {a: [] for a in ANALYSTS}
d = START; tid = 0
while d <= TODAY - dt.timedelta(days=2):
    if d.weekday() not in (4, 5) and random.random() < 0.9:
        a = random.choice(list(ANALYSTS)); tid += 1
        load = len([f for f in open_until[a] if f > d]); dur = random.choice([1, 2, 3, 5, 7, 10]); pri = random.choice(['High', 'Normal', 'Normal', 'Low'])
        p_late = 0.1 + 0.08 * max(0, load - 2) + 0.03 * dur + (0.1 if pri == 'High' else 0)
        late = random.random() < min(0.9, p_late); fin = d + dt.timedelta(days=dur + (random.randint(1, 6) if late else -random.randint(0, min(dur, 2))))
        done = fin < TODAY
        rec = {'id': f'td-{tid}', 'c': 'todo', 'task': random.choice(['Update order set for ICU', 'Prepare monthly OR report', 'Fix pharmacy label template', 'Test new triage form', 'Clean up clinic schedules', 'Review nursing MAR build', 'Train new pharmacists', 'Add coverage for clinic']), 'analyst': a, 'team': 'apps', 'assigned': iso(d), 'duration': dur, 'priority': pri, 'status': 'Resolved' if done else 'In Progress', 'finish': iso(fin) if done else '', 'instruction': 'Please follow up' if random.random() < 0.4 else '', '_ts': ts(fin if done else d)}
        add('apps-mgr.json', rec, 'apps-mgr'); open_until[a].append(fin)
    d += dt.timedelta(days=1)

# quick wins (one fixed the ER triage form half-way through the year)
fixd = START + dt.timedelta(days=int(365 * 0.55))
add('sara.json', {'id': 'qw-1', 'c': 'quickwin', 'qwId': 'QW-031', 'analyst': 'sara', 'team': 'apps', 'module': 'Physician', 'subject': 'ER triage form freezing fix', 'impact': 'Triage form no longer hangs when saving', 'type': 'Modification', 'status': 'Completed', 'approval': 'Accepted', 'date': iso(fixd - dt.timedelta(days=4)), 'expected': iso(fixd), '_ts': ts(fixd)}, 'sara')
add('yousef.json', {'id': 'qw-2', 'c': 'quickwin', 'qwId': 'QW-045', 'analyst': 'yousef', 'team': 'apps', 'module': 'Pharmacy', 'subject': 'ER label template fix', 'impact': 'Labels print with full drug name in ER', 'type': 'Modification', 'status': 'Completed', 'approval': 'Accepted', 'date': iso(TODAY - dt.timedelta(days=200)), 'expected': iso(TODAY - dt.timedelta(days=198)), '_ts': ts(TODAY - dt.timedelta(days=198))}, 'yousef')
for i, (s, m) in enumerate([('Order set favourites cleanup', 'Physician'), ('Clinic schedule template', 'Special Clinic'), ('Nursing assessment shortcut', 'Nursing'), ('Discharge report filter', 'Reports'), ('Radiology order alert text', 'Radiology')] * 6):
    a = random.choice(list(ANALYSTS)); dd = START + dt.timedelta(days=random.randint(0, 360))
    add(f'{a}.json', {'id': f'qw-x{i}', 'c': 'quickwin', 'analyst': a, 'team': 'apps', 'module': m if i % 7 else '', 'subject': s, 'impact': 'Saves clicks', 'type': 'Modification', 'status': 'Completed', 'date': iso(dd), 'expected': iso(dd + dt.timedelta(days=3)), '_ts': ts(dd)}, a)
# Central follow-up stuck in review
for i in range(5):
    dd = TODAY - dt.timedelta(days=100 + i * 20)
    add('layla.json', {'id': f'rf-{i}', 'c': 'central', 'analyst': 'layla', 'team': 'apps', 'module': 'OR', 'subject': random.choice(['Modification: OR booking slot overlap', 'OR booking double slot enhancement']), 'type': 'Modification', 'status': 'Under Review', 'date': iso(dd), '_ts': ts(dd)}, 'layla')
# personal tasks
for a in ANALYSTS:
    for i in range(10):
        dd = TODAY - dt.timedelta(days=random.randint(0, 150))
        add(f'{a}.json', {'id': f'mt-{a}-{i}', 'c': 'mytask', 'owner': a, 'title': random.choice(['Check pharmacy label queue', 'Clean up order set list', 'Weekly report prep']), 'plan': iso(dd), 'status': 'Done', 'doneDate': iso(dd), '_ts': ts(dd)}, a)
# the super admin's PIN (1234)
add('adam.json', {'id': 'userpin-adam', 'c': 'userpin', 'member': 'adam', 'pin': pin_hash('1234'), '_ts': ts(START)}, 'adam')

out = {f: {'user': f.split('.')[0], 'updated': iso(TODAY), 'records': recs} for f, recs in files.items()}
if __name__ == '__main__':
    import sys
    json.dump(out, open(sys.argv[1], 'w'))
    print(len(out), 'files', sum(len(v['records']) for v in out.values()), 'records')
