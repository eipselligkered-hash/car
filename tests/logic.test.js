import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDate, daysBetween, inText, kitCounts, filterKit, groupKit, checkProgress, dateView, openCheck, lastCheck } from '../src/logic.js';
import { ITEMS, DATES, WASH } from '../src/seed.js';

test('dates are dd/mm/yyyy', () => {
  assert.equal(fmtDate('2026-12-01'), '01/12/2026');
  assert.equal(fmtDate('2026-10-24', { long: true }), 'Saturday 24/10/2026');
  assert.equal(daysBetween('2026-10-24', '2026-12-01'), 38);
  assert.equal(inText(0), 'today'); assert.equal(inText(-3), '3 days ago');
});
test('seed: UK spelling, sections, critical flags', () => {
  const txt = JSON.stringify(ITEMS);
  for (const us of ['Flashlight', 'trash', 'sanitizer', 'Trunk', 'trunk', 'Center', 'liter', 'poop', 'leash', 'organizer', 'Microfiber', 'zip ties']) assert.ok(!txt.includes(us), us);
  for (const uk of ['Torch', 'bin bag', 'sanitiser', 'licence', 'litres', 'Microfibre']) assert.ok(txt.includes(uk), uk);
  assert.deepEqual([...new Set(ITEMS.map((i) => i.section))], ['glovebox', 'cabin', 'boot', 'frunk', 'seasonal']);
  const umb = ITEMS.find((i) => i.name === 'Compact umbrella'); assert.equal(umb.critical, true); assert.equal(umb.note, 'Ireland rain');
  assert.equal(ITEMS.filter((i) => i.critical).length, 15);
  assert.ok(!ITEMS.some((i) => /Legal docs, spare key|Get These First/i.test(i.name)), 'summary section skipped');
  assert.equal(new Set([...ITEMS, ...DATES, ...WASH].map((x) => x.id)).size, ITEMS.length + DATES.length + WASH.length);
  assert.deepEqual(WASH.map((w) => w.name), ['Roof', 'Windows', 'Bonnet', 'Sides', 'Boot', 'Wheels']);
});
test('kit counts and filters', () => {
  const items = [{ id: 'a', section: 'boot', name: 'A', have: true, packed: true, critical: true }, { id: 'b', section: 'boot', name: 'B', have: true, packed: false },
    { id: 'c', section: 'frunk', name: 'C', have: false, packed: false, critical: true }];
  const k = kitCounts(items);
  assert.deepEqual([k.have, k.packed, k.toBuy, k.notPacked, k.crit, k.critHave], [2, 1, 1, 1, 2, 1]);
  assert.deepEqual(filterKit(items, 'buy').map((i) => i.id), ['c']);
  assert.deepEqual(filterKit(items, 'pack').map((i) => i.id), ['b']);
  assert.deepEqual(filterKit(items, 'critical').map((i) => i.id), ['a', 'c']);
  assert.deepEqual(groupKit(items).map((g) => g.label), ['Boot', 'Frunk']);
});
test('kit check progress', () => {
  const items = [{ id: 'a', section: 'boot', name: 'A', packed: true, sort_order: 1 }, { id: 'b', section: 'glovebox', name: 'B', packed: true }, { id: 'c', section: 'boot', name: 'C', packed: false }];
  const p = checkProgress(items, { results: { b: 'ok', a: 'missing' } });
  assert.equal(p.total, 2); assert.equal(p.done, 2); assert.equal(p.next, null); assert.deepEqual(p.missing.map((i) => i.id), ['a']);
  assert.equal(checkProgress(items, { results: {} }).next.id, 'b');   // glovebox first
  const checks = [{ kind: 'kit', started_at: '2026-10-01T10:00', completed_on: '2026-10-01' }, { kind: 'kit', started_at: '2026-10-20T10:00', completed_on: null }, { kind: 'wash', started_at: '2026-10-21', completed_on: '2026-10-21' }];
  assert.equal(openCheck(checks).started_at, '2026-10-20T10:00'); assert.equal(lastCheck(checks).completed_on, '2026-10-01'); assert.equal(lastCheck(checks, 'wash').completed_on, '2026-10-21');
});
test('date view: sorted, reminders, recommended', () => {
  const v = dateView(DATES, '2026-12-02');
  assert.deepEqual(v.rows.map((r) => r.d.title.split(' ')[0]), ['Book', 'Motor', 'Basic', 'First', 'Car']);
  assert.equal(v.rows[0].days, 30);
  assert.deepEqual(v.reminders.map((r) => r.d.title), ['Book Tesla service (incl. end-of-warranty check)']);
  assert.equal(dateView(DATES, '2026-10-24').reminders.length, 0);
  assert.equal(dateView(DATES, '2027-04-01').reminders.length, 2);
  assert.deepEqual(v.rec.map((r) => r.cost), ['about €85', 'about €74']);
});
import { addMonths, nextDue, jobStatus, jobView } from '../src/logic.js';
import { JOBS } from '../src/seed.js';
test('car jobs: next due, flags, grouping', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(addMonths('2025-09-28', 6), '2026-03-28');
  assert.equal(nextDue({ frequency: 'weekly', last_done: '2026-10-20' }), '2026-10-27');
  assert.equal(nextDue({ frequency: 'fortnightly', last_done: '2026-10-20' }), '2026-11-03');
  const T = '2026-10-24', st = (frequency, last_done) => jobStatus({ frequency, last_done }, T).state;
  assert.equal(st('weekly', '2026-10-16'), 'overdue');   // due 23/10
  assert.equal(st('weekly', '2026-10-20'), 'soon');      // due 27/10 = 3 days
  assert.equal(st('weekly', '2026-10-21'), 'ok');        // 4 days
  assert.equal(st('weekly', '2026-10-17'), 'soon');      // due today
  assert.equal(st('monthly', '2026-09-30'), 'soon');     // 30/10 = 6 days
  assert.equal(st('monthly', '2026-10-02'), 'ok');       // 02/11 = 9 days
  assert.equal(st('6monthly', '2026-05-05'), 'soon');    // 05/11 = 12 days
  assert.equal(st('monthly', null), 'duenow'); assert.equal(st('once', null), 'todo'); assert.equal(st('once', T), 'done');
  const v = jobView(JOBS, T);
  assert.equal(v.now[0].job.title, 'Check the wiper blades');   // overdue since 28/03/2026 comes first
  assert.equal(v.now.length, 10); assert.equal(v.oneoff.length, 4); assert.equal(v.ok.length + v.soon.length, 0);
  assert.equal(JOBS.length, 14);
  for (const us of ['color', 'vacuum', 'windshield', 'hood', 'trunk', 'tire', 'washer fluid']) assert.ok(!JSON.stringify(JOBS).toLowerCase().includes(us), us);
});
