'use strict';
/**
 * Courier Rate BD — unit tests for js/core.js (pure logic, no DOM).
 * Hand-computed expected values (verified by hand before writing):
 *   A: base 60, perKg 20, weight 2.5, COD 1000 @ 1%  -> extra=ceil(1.5)=2 -> 60+40+10 = 110
 *   B: base 80, perKg 30, weight 1.0, COD 0, min 100 -> 80 -> min applied -> 100
 *   C: base 50, perKg 25, weight 0.5                 -> extra 0 -> 50
 *   D: base 100, perKg 10, weight 50, min 0          -> extra 49 -> 100+490 = 590
 *   E: base 70, perKg 40, weight 1.0 exactly         -> 70
 *   F: COD 500 @ 2% -> fee 10 ; COD 0% -> fee 0
 *   G: base 90, perKg 10, weight 3, COD 0, min 50   -> 90+20=110, min NOT applied
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

function mkCourier(name, inside, outside) {
  return {
    name,
    rates: {
      inside: { base: 60, perKg: 20, codPct: 1, minCharge: 60, daysMin: 1, daysMax: 2, ...inside },
      outside: { base: 120, perKg: 30, codPct: 1, minCharge: 120, daysMin: 2, daysMax: 4, ...outside },
    },
  };
}

test('cost calc A: fractional weight 2.5kg with COD', () => {
  const c = mkCourier('A');
  const r = Core.computeCost(c, 2.5, 'inside', 1000);
  assert.equal(r.extraKg, 2);
  assert.equal(r.extraCost, 40);
  assert.equal(r.codFee, 10);
  assert.equal(r.total, 110);
  assert.equal(r.minApplied, false);
});

test('cost calc B: exact 1kg, minimum charge applies', () => {
  const c = mkCourier('B', { base: 80, perKg: 30, minCharge: 100 });
  const r = Core.computeCost(c, 1.0, 'inside', 0);
  assert.equal(r.extraKg, 0);
  assert.equal(r.total, 100);
  assert.equal(r.minApplied, true);
});

test('cost calc C: 0.5kg charges base only', () => {
  const c = mkCourier('C', { base: 50, perKg: 25, minCharge: 0 });
  const r = Core.computeCost(c, 0.5, 'inside', 0);
  assert.equal(r.extraKg, 0);
  assert.equal(r.extraCost, 0);
  assert.equal(r.total, 50);
});

test('cost calc D: 50kg cap boundary', () => {
  const c = mkCourier('D', { base: 100, perKg: 10, minCharge: 0 });
  const r = Core.computeCost(c, 50, 'inside', 0);
  assert.equal(r.extraKg, 49);
  assert.equal(r.total, 590);
});

test('cost calc E: exact 1kg, no extra, no COD', () => {
  const c = mkCourier('E', { base: 70, perKg: 40, minCharge: 0 });
  const r = Core.computeCost(c, 1, 'inside', 0);
  assert.equal(r.total, 70);
});

test('cost calc F: COD fee 2% and 0%', () => {
  const c2 = mkCourier('F2', { base: 60, perKg: 20, codPct: 2, minCharge: 0 });
  assert.equal(Core.computeCost(c2, 1, 'inside', 500).codFee, 10);
  assert.equal(Core.computeCost(c2, 1, 'inside', 500).total, 70);
  const c0 = mkCourier('F0', { base: 60, perKg: 20, codPct: 0, minCharge: 0 });
  assert.equal(Core.computeCost(c0, 1, 'inside', 500).codFee, 0);
  assert.equal(Core.computeCost(c0, 1, 'inside', 500).total, 60);
});

test('cost calc G: minimum charge NOT applied when total exceeds it', () => {
  const c = mkCourier('G', { base: 90, perKg: 10, minCharge: 50 });
  const r = Core.computeCost(c, 3, 'inside', 0);
  assert.equal(r.total, 110);
  assert.equal(r.minApplied, false);
});

test('cost calc: outside zone uses outside rates', () => {
  const c = mkCourier('H');
  const r = Core.computeCost(c, 2, 'outside', 0);
  assert.equal(r.total, 150); // 120 + 1x30
  assert.equal(r.daysMin, 2);
  assert.equal(r.daysMax, 4);
});

test('cost calc: weight just above 1kg rounds up to a full extra kg', () => {
  const c = mkCourier('I', { base: 60, perKg: 20, minCharge: 0 });
  assert.equal(Core.computeCost(c, 1.01, 'inside', 0).total, 80);
  assert.equal(Core.computeCost(c, 2.0, 'inside', 0).total, 80);
  assert.equal(Core.computeCost(c, 2.01, 'inside', 0).total, 100);
});

test('estimateAll: sorted cheapest first with badges', () => {
  const cheap = mkCourier('Cheap', { base: 50, perKg: 10, minCharge: 0, daysMin: 3, daysMax: 5 });
  const fast = mkCourier('Fast', { base: 90, perKg: 10, minCharge: 0, daysMin: 1, daysMax: 1 });
  const mid = mkCourier('Mid', { base: 70, perKg: 10, minCharge: 0, daysMin: 2, daysMax: 3 });
  const rows = Core.estimateAll([fast, cheap, mid], 1, 'inside', 0);
  assert.deepEqual(rows.map((r) => r.courier.name), ['Cheap', 'Mid', 'Fast']);
  assert.equal(rows[0].cheapest, true);
  assert.equal(rows[1].cheapest, false);
  assert.equal(rows[2].fastest, true); // Fast has daysMin 1
  assert.equal(rows[0].fastest, false);
});

test('estimateAll: empty list returns empty', () => {
  assert.deepEqual(Core.estimateAll([], 2, 'inside', 0), []);
});

test('sortByInsideBase and sortByFastest', () => {
  // outside-zone days set explicitly so "fastest" (min daysMin across zones) is unambiguous
  const a = mkCourier('A', { base: 90, daysMin: 3, daysMax: 4 }, { daysMin: 3, daysMax: 4 });
  const b = mkCourier('B', { base: 50, daysMin: 2, daysMax: 5 }, { daysMin: 2, daysMax: 3 });
  const c = mkCourier('C', { base: 70, daysMin: 1, daysMax: 2 }, { daysMin: 1, daysMax: 2 });
  assert.deepEqual(Core.sortByInsideBase([a, b, c]).map((x) => x.name), ['B', 'C', 'A']);
  assert.deepEqual(Core.sortByFastest([a, b, c]).map((x) => x.name), ['C', 'B', 'A']);
});

test('dashboard helpers: cheapestInsideBase / fastestDelivery', () => {
  assert.equal(Core.cheapestInsideBase([]), null);
  assert.equal(Core.fastestDelivery([]), null);
  const list = [mkCourier('A', { base: 90, daysMin: 2, daysMax: 3 }), mkCourier('B', { base: 50, daysMin: 1, daysMax: 1 })];
  assert.equal(Core.cheapestInsideBase(list), 50);
  assert.deepEqual(Core.fastestDelivery(list), { daysMin: 1, daysMax: 1 });
});

test('validateEstimate: rejects bad inputs, accepts good ones', () => {
  assert.ok(Core.validateEstimate(0, 'inside', 0).includes('weightInvalid'));
  assert.ok(Core.validateEstimate(-1, 'inside', 0).includes('weightInvalid'));
  assert.ok(Core.validateEstimate(NaN, 'inside', 0).includes('weightInvalid'));
  assert.ok(Core.validateEstimate(50.01, 'inside', 0).includes('weightTooHeavy'));
  assert.ok(Core.validateEstimate(50, 'inside', 0).length === 0);
  assert.ok(Core.validateEstimate(0.1, 'inside', 0).length === 0);
  assert.ok(Core.validateEstimate(2, 'inside', -5).includes('codInvalid'));
  assert.ok(Core.validateEstimate(2, 'nowhere', 0).includes('zoneInvalid'));
  assert.ok(Core.validateEstimate(2, 'outside', 1000).length === 0);
});

test('validateCourier: valid courier passes', () => {
  assert.deepEqual(Core.validateCourier(mkCourier('OK'), []), []);
});

test('validateCourier: name required and duplicate (case-insensitive)', () => {
  assert.ok(Core.validateCourier(mkCourier('  '), []).includes('nameRequired'));
  assert.ok(Core.validateCourier({ name: 42, rates: mkCourier('X').rates }, []).includes('nameRequired'));
  assert.ok(Core.validateCourier(mkCourier('DHL'), ['dhl']).includes('nameDuplicate'));
  assert.ok(Core.validateCourier(mkCourier('DHL'), ['Dhl Express']).length === 0);
});

test('validateCourier: bad zone values rejected', () => {
  assert.ok(Core.validateCourier(mkCourier('X', { base: 0 }), []).some((e) => e.endsWith('baseInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { base: -5 }), []).some((e) => e.endsWith('baseInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { perKg: -1 }), []).some((e) => e.endsWith('perKgInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { codPct: 101 }), []).some((e) => e.endsWith('codPctInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { codPct: -1 }), []).some((e) => e.endsWith('codPctInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { minCharge: -1 }), []).some((e) => e.endsWith('minChargeInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { daysMin: 0 }), []).some((e) => e.endsWith('daysMinInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { daysMin: 1.5 }), []).some((e) => e.endsWith('daysMinInvalid')));
  assert.ok(Core.validateCourier(mkCourier('X', { daysMin: 3, daysMax: 2 }), []).some((e) => e.endsWith('daysMaxInvalid')));
  // equal min/max days is fine
  assert.deepEqual(Core.validateCourier(mkCourier('X', { daysMin: 2, daysMax: 2 }), []), []);
  // missing rates object
  assert.ok(Core.validateCourier({ name: 'X' }, []).includes('ratesMissing'));
  // non-object
  assert.ok(Core.validateCourier(null, []).includes('courierMissing'));
});

test('validateImport: good array imports cleanly', () => {
  const res = Core.validateImport(JSON.stringify([mkCourier('One'), mkCourier('Two')]));
  assert.equal(res.ok, true);
  assert.equal(res.couriers.length, 2);
  assert.equal(res.rejected.length, 0);
  assert.equal(res.error, null);
});

test('validateImport: accepts this app\'s own export shape { couriers: [...] }', () => {
  const exported = JSON.stringify({
    app: 'courier-rate-bd', version: 1, exportedAt: '2026-11-17T00:00:00.000Z',
    couriers: [mkCourier('One'), mkCourier('Two')],
  });
  const res = Core.validateImport(exported);
  assert.equal(res.ok, true);
  assert.equal(res.couriers.length, 2);
  assert.equal(res.rejected.length, 0);
});

test('validateImport: object without a couriers array is still rejected', () => {
  const res = Core.validateImport(JSON.stringify({ app: 'courier-rate-bd', couriers: 'nope' }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'notArray');
});

test('validateImport: malformed JSON rejected', () => {
  const res = Core.validateImport('{not json');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'jsonParse');
  assert.equal(res.couriers.length, 0);
});

test('validateImport: non-array top level rejected', () => {
  const res = Core.validateImport(JSON.stringify({ name: 'NotAnArray' }));
  assert.equal(res.ok, false);
  assert.equal(res.error, 'notArray');
});

test('validateImport: wrong-shape entries rejected individually', () => {
  const res = Core.validateImport(JSON.stringify([
    mkCourier('Good'),
    { name: 'NoRates' },
    { name: 'BadBase', rates: { inside: { base: -1, perKg: 0, codPct: 0, minCharge: 0, daysMin: 1, daysMax: 1 }, outside: { base: 1, perKg: 0, codPct: 0, minCharge: 0, daysMin: 1, daysMax: 1 } } },
    'just a string',
    null,
  ]));
  assert.equal(res.ok, true);
  assert.equal(res.couriers.length, 1);
  assert.equal(res.couriers[0].name, 'Good');
  assert.equal(res.rejected.length, 4);
  assert.deepEqual(res.rejected.map((r) => r.index), [1, 2, 3, 4]);
});

test('validateImport: negative numbers rejected', () => {
  const bad = mkCourier('Neg', { base: 10, perKg: -5 });
  const res = Core.validateImport(JSON.stringify([bad]));
  assert.equal(res.couriers.length, 0);
  assert.equal(res.rejected.length, 1);
});

test('validateImport: duplicate names inside one import rejected', () => {
  const res = Core.validateImport(JSON.stringify([mkCourier('Dup'), mkCourier('dup')]));
  assert.equal(res.couriers.length, 1);
  assert.equal(res.rejected.length, 1);
  assert.ok(res.rejected[0].reason.includes('nameDuplicate'));
});

test('validateImport: empty array is valid (zero couriers)', () => {
  const res = Core.validateImport('[]');
  assert.equal(res.ok, true);
  assert.equal(res.couriers.length, 0);
  assert.equal(res.rejected.length, 0);
});

test('demoCouriers: three valid demo couriers, all flagged demo', () => {
  const demo = Core.demoCouriers();
  assert.equal(demo.length, 3);
  for (const c of demo) {
    assert.equal(c.demo, true);
    assert.deepEqual(Core.validateCourier(c, []), []);
  }
});

test('formatting: Bengali digits and money', () => {
  assert.equal(Core.toBengaliDigits('0123456789'), '০১২৩৪৫৬৭৮৯');
  assert.equal(Core.formatMoney(110, 'en'), '৳110');
  assert.equal(Core.formatMoney(1100, 'bn'), '৳১,১০০');
  assert.equal(Core.formatMoney(10.5, 'en'), '৳10.50');
  assert.equal(Core.formatNumber(2.5, 'bn'), '২.৫');
  assert.equal(Core.formatNumber(50, 'en'), '50');
});
