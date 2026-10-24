"""Builds src/seed.js: the kit list (UK spelling, from car-kit-list.txt), dates, recommended jobs and wash steps.
Ids are fixed (uuid5) so seeding twice from two phones can't create duplicates."""
import json, uuid, os
NS = uuid.UUID('6c1a7f62-1d0e-4c5e-9a43-231d43971000')
I = lambda key: str(uuid.uuid5(NS, key))
C = lambda why=None: ('crit', why)
KIT = {
 'glovebox': [
  ('Driving licence', C('legal docs')), ('Vehicle registration certificate (logbook)', C('legal docs')),
  ('Insurance certificate', C('legal docs')), ('Spare key card / fob', C()),
  ('Pen + small notepad',), ('USB-C cables',), ('Small portable power bank',), ('Sunglasses + compact sunshade',),
  ('Hand sanitiser',), ('Wet wipes',), ('Tissues',), ('Cash / coins for parking and tolls',),
  ('Emergency contact card with medical info',)],
 'cabin': [
  ('Dyson Car+Boat vacuum (or strong handheld) + charger', C('for white hairs on black interior')),
  ('Spare vacuum filters',),
  ('Rubber grooming brush / lint roller / pet hair remover tool', C('lurcher shedding')),
  ('Microfibre cloths + interior detailing spray (black-safe)',), ('Small bin bag or bin',),
  ('Dog poo bags, lead, portable water bowl + bottle, treats', C('daily with dog')),
  ('Old towels for muddy paws',), ('Compact umbrella', C('Ireland rain')),
  ('Hi-vis vest (for you)', C('on the "get these first" list'))],
 'boot': [
  ('Waterproof boot liner extension or cargo mat', None, "if the pet liner doesn't fully cover"),
  ('Crash-tested dog harness or tether (clips to seatbelt)', C('safety on trips')),
  ('Full first aid kit', C(), 'expand your existing Tesla safety kit'),
  ('Extra microfibre cloths, glass cleaner',),
  ('Rubber seal cleaner + protectant', C('from your recent issue'), 'for green algae on the window rubbers'),
  ('Warm blanket(s) + foil emergency blanket',),
  ('Non-perishable snacks (energy bars) + bottled water (2–3 litres)',),
  ('Reusable shopping bags',)],
 'frunk': [
  ('Warning triangle', C('Ireland/EU recommended')), ('Hi-vis vest (spare)',),
  ('Portable air compressor', None, 'backs up your inflator'),
  ('Jump starter / larger power bank', C('Tesla 12V support')), ('Tow strap / recovery rope',),
  ('Multi-tool, duct tape, cable ties, work gloves',), ('Torch / head torch + spare batteries',),
  ('De-icer spray + ice scraper', C('Dublin winters')), ('Small fire extinguisher (ABC type)',)],
 'seasonal': [
  ('Cargo net or straps', None, 'to secure things in the boot'), ('Seat gap fillers', None, 'stop white hairs falling through'),
  ('Window sunshades (for parking)',), ('Compact snow brush / shovel', None, 'rare Dublin use'),
  ('Dog first aid extras (tick remover etc.)', None, 'for Wicklow/Wexford trips'), ('Public charging adapter / cable',)],
}
items = []
for sec, rows in KIT.items():
    for n, r in enumerate(rows):
        name, crit, extra = r[0], (r[1] if len(r) > 1 else None), (r[2] if len(r) > 2 else None)
        why = crit[1] if crit else None
        note = '; '.join(x for x in [why, extra] if x) or None
        items.append({'id': I('item:' + sec + ':' + name), 'section': sec, 'name': name, 'critical': bool(crit), 'note': note,
                      'have': False, 'packed': False, 'sort_order': (n + 1) * 10})
dates = [
 dict(title='Book Tesla service (incl. end-of-warranty check)', due_date='2027-01-01', due_label='January 2027', remind_on='2026-12-01',
      note='Ask them to check everything that should be fixed under the basic warranty before it ends.'),
 dict(title='Basic warranty expires', due_date='2027-06-23', remind_on=None, note='Or at 80,000 km, whichever comes first (about 29,000 km now).'),
 dict(title='First NCT due', due_date='2027-06-23', due_label='around 23/06/2027', remind_on='2027-04-01', note='Book early – NCT slots fill up.'),
 dict(title='Motor tax expires', due_date='2027-05-31', remind_on=None, note=None),
 dict(title='Car insurance renews (123.ie)', due_date='2027-06-23', due_label='around 23/06/2027', remind_on=None, note='Compare quotes before it auto-renews.'),
]
rec = [dict(title='Replace wiper blades', cost='about €85'), dict(title='Tyre rotation', cost='about €74')]
alld = []
for n, d in enumerate(dates):
    alld.append({'id': I('date:' + d['title']), 'kind': 'date', 'due_label': None, 'cost': None, 'done_on': None, 'sort_order': (n + 1) * 10, **d})
for n, d in enumerate(rec):
    alld.append({'id': I('rec:' + d['title']), 'kind': 'recommended', 'due_date': None, 'due_label': None, 'remind_on': None,
                 'note': 'Recommended by the Tesla app', 'done_on': None, 'sort_order': (n + 1) * 10, **d})
wash = [{'id': I('wash:' + w), 'name': w, 'done': False, 'sort_order': (n + 1) * 10} for n, w in enumerate(['Roof', 'Windows', 'Bonnet', 'Sides', 'Boot', 'Wheels'])]
ACE = 'When the Tesla is collected from Ace Autobody'
JOBS = [
 ('once', 'Check the repair has been signed off, including the wheel alignment, rear half-shaft and CV joints', None, ACE, None),
 ('once', 'Run the kit check', None, ACE, 'check'),
 ('once', 'Return the Enterprise Kuga (241-D-24547)', None, ACE, None),
 ('once', "File Ace's paperwork and photos", None, ACE, None),
 ('weekly', 'Charge to 100% (LFP battery)', None, None, None),
 ('weekly', 'Check tyre pressures in the Tesla app', None, None, None),
 ('fortnightly', 'Jet wash (roof, windows, bonnet, sides, boot, wheels)', None, None, 'wash'),
 ('fortnightly', 'Hoover dog hair and wipe the interior', None, None, None),
 ('monthly', 'Top up screenwash', None, 'Use winter-rated screenwash from October to March.', None),
 ('monthly', 'Clean the window rubbers and treat them for algae', None, None, None),
 ('monthly', 'Check tyre tread and look for damage', None, None, None),
 ('monthly', 'Clear leaves from the scuttle under the windscreen and from the frunk edges', None, None, None),
 ('6monthly', 'Check the wiper blades', '2025-09-28', None, None),
 ('6monthly', 'Seal or wax the paint', None, None, None),
]
jobs = [{'id': I('job:' + t), 'title': t, 'frequency': f, 'last_done': ld, 'note': note, 'link_tab': link, 'sort_order': (n + 1) * 10}
        for n, (f, t, ld, note, link) in enumerate(JOBS)]
# SQL seed block for setup.sql (same fixed ids as the app's seed, so the two can't double up)
q = lambda v: 'null' if v is None else "'" + str(v).replace("'", "''") + "'"
vals = ',\n'.join(f"  ({q(j['id'])}, {q(j['title'])}, {q(j['frequency'])}, {q(j['last_done'])}, {q(j['note'])}, {q(j['link_tab'])}, {j['sort_order']})" for j in jobs)
sql_seed = f"""-- @@JOBS-SEED-START (generated by scripts/make_seed.py)
-- Starting car jobs for everyone who already uses the car app (has kit items) and has no jobs yet. The app does the same on first sign-in.
insert into public.car_jobs (id, owner_id, title, frequency, last_done, note, link_tab, sort_order)
select v.id::uuid, u.owner_id, v.title, v.frequency, v.last_done::date, v.note, v.link_tab, v.sort_order
from (select distinct owner_id from public.car_items) u
cross join (values
{vals}
) as v(id, title, frequency, last_done, note, link_tab, sort_order)
where not exists (select 1 from public.car_jobs j where j.owner_id = u.owner_id)
on conflict (id) do nothing;
-- @@JOBS-SEED-END"""
sp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'supabase', 'setup.sql')
cur = open(sp).read()
import re
cur = re.sub(r'-- @@JOBS-SEED-START.*?-- @@JOBS-SEED-END', lambda m: sql_seed, cur, flags=re.S)
open(sp, 'w').write(cur)
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'seed.js')
with open(out, 'w') as f:
    f.write('// Generated by scripts/make_seed.py – starting data, added the first time you sign in.\n')
    for k, v in [('ITEMS', items), ('DATES', alld), ('WASH', wash), ('JOBS', jobs)]:
        f.write(f'export const {k} = {json.dumps(v, ensure_ascii=False, indent=1)};\n')
print(len(items), 'items,', sum(i['critical'] for i in items), 'critical,', len(alld), 'dates,', len(wash), 'wash,', len(jobs), 'jobs')
