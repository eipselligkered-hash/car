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
