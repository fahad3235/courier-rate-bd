'use strict';
/**
 * Courier Rate BD — pure logic (no DOM). Node-testable.
 *
 * Cost model (per courier, per zone):
 *   total = base + ceil(max(weight - 1, 0)) x perKg + codAmount x codPct/100
 *   total = max(total, minCharge)
 * Extra weight is charged per started kg above the first 1 kg.
 * No real courier prices are bundled anywhere in this app.
 */

const MAX_WEIGHT_KG = 50;
const MIN_WEIGHT_KG = 0; // exclusive: weight must be > 0
const ZONES = ['inside', 'outside'];
const STORAGE_KEY = 'courierRateBD.v1';

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function extraKg(weight) {
  return Math.max(0, Math.ceil(weight - 1));
}

/**
 * Validate one zone's rates. Returns an array of error codes (empty = valid).
 */
function validateZoneRates(r) {
  const errs = [];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['zoneMissing'];
  if (!isNum(r.base) || r.base <= 0) errs.push('baseInvalid');
  if (!isNum(r.perKg) || r.perKg < 0) errs.push('perKgInvalid');
  if (!isNum(r.codPct) || r.codPct < 0 || r.codPct > 100) errs.push('codPctInvalid');
  if (!isNum(r.minCharge) || r.minCharge < 0) errs.push('minChargeInvalid');
  if (!Number.isInteger(r.daysMin) || r.daysMin < 1) errs.push('daysMinInvalid');
  if (!Number.isInteger(r.daysMax) || r.daysMax < r.daysMin) errs.push('daysMaxInvalid');
  return errs;
}

/**
 * Validate a courier object.
 * @param {object} c - courier { name, rates: { inside: {...}, outside: {...} } }
 * @param {string[]} [existingNames] - names already in use (duplicate check, case-insensitive)
 * @returns {string[]} error codes, empty when valid
 */
function validateCourier(c, existingNames) {
  const errs = [];
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['courierMissing'];
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) {
    errs.push('nameRequired');
  } else if (
    Array.isArray(existingNames) &&
    existingNames.some(
      (n) => typeof n === 'string' && n.trim().toLowerCase() === name.toLowerCase()
    )
  ) {
    errs.push('nameDuplicate');
  }
  if (!c.rates || typeof c.rates !== 'object') {
    errs.push('ratesMissing');
    return errs;
  }
  for (const z of ZONES) {
    for (const e of validateZoneRates(c.rates[z])) errs.push(z + ':' + e);
  }
  return errs;
}

/**
 * Validate estimator inputs. Returns error codes (empty = valid).
 */
function validateEstimate(weight, zone, codAmount) {
  const errs = [];
  if (!isNum(weight) || weight <= MIN_WEIGHT_KG) errs.push('weightInvalid');
  else if (weight > MAX_WEIGHT_KG) errs.push('weightTooHeavy');
  if (!ZONES.includes(zone)) errs.push('zoneInvalid');
  if (!isNum(codAmount) || codAmount < 0) errs.push('codInvalid');
  return errs;
}

/**
 * Cost for one courier / zone / weight / COD amount.
 * @returns {{total:number, base:number, extraKg:number, extraCost:number, codFee:number, minApplied:boolean, daysMin:number, daysMax:number}}
 */
function computeCost(courier, weight, zone, codAmount) {
  const r = courier.rates[zone];
  const extra = extraKg(weight);
  const extraCost = extra * r.perKg;
  const codFee = (codAmount || 0) * (r.codPct / 100);
  let total = r.base + extraCost + codFee;
  const minApplied = total < r.minCharge;
  if (minApplied) total = r.minCharge;
  return {
    total,
    base: r.base,
    extraKg: extra,
    extraCost,
    codFee,
    minApplied,
    daysMin: r.daysMin,
    daysMax: r.daysMax,
  };
}

/**
 * Estimate for every courier, cheapest first. Adds cheapest/fastest flags.
 * @returns {Array} entries { courier, cost, cheapest, fastest } sorted by total asc
 */
function estimateAll(couriers, weight, zone, codAmount) {
  const rows = couriers.map((c) => ({ courier: c, cost: computeCost(c, weight, zone, codAmount) }));
  rows.sort((a, b) => a.cost.total - b.cost.total);
  if (rows.length > 0) rows[0].cheapest = true;
  let fastestIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i].cost;
    const b = rows[fastestIdx].cost;
    if (a.daysMin < b.daysMin || (a.daysMin === b.daysMin && a.daysMax < b.daysMax)) {
      fastestIdx = i;
    }
  }
  if (rows.length > 0) rows[fastestIdx].fastest = true;
  return rows.map((r) => ({ ...r, cheapest: !!r.cheapest, fastest: !!r.fastest }));
}

/** Sort couriers by Inside-Dhaka base charge, cheapest first. */
function sortByInsideBase(couriers) {
  return [...couriers].sort((a, b) => a.rates.inside.base - b.rates.inside.base);
}

/** Sort couriers by fastest delivery (smallest daysMin across zones, then daysMax). */
function sortByFastest(couriers) {
  const key = (c) => ({
    min: Math.min(c.rates.inside.daysMin, c.rates.outside.daysMin),
    max: Math.min(c.rates.inside.daysMax, c.rates.outside.daysMax),
  });
  return [...couriers].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka.min - kb.min || ka.max - kb.max;
  });
}

function cheapestInsideBase(couriers) {
  if (!couriers.length) return null;
  return Math.min(...couriers.map((c) => c.rates.inside.base));
}

function fastestDelivery(couriers) {
  if (!couriers.length) return null;
  let best = null;
  for (const c of couriers) {
    for (const z of ZONES) {
      const r = c.rates[z];
      if (!best || r.daysMin < best.daysMin || (r.daysMin === best.daysMin && r.daysMax < best.daysMax)) {
        best = { daysMin: r.daysMin, daysMax: r.daysMax };
      }
    }
  }
  return best;
}

/**
 * Strict import validation.
 * Accepts a JSON string (or already-parsed value) holding an ARRAY of couriers.
 * Every courier is validated; invalid ones are rejected individually and reported.
 * @returns {{ ok:boolean, couriers:object[], rejected:{index:number, reason:string}[], error:string|null }}
 */
function validateImport(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return { ok: false, couriers: [], rejected: [], error: 'jsonParse' };
    }
  }
  if (!Array.isArray(parsed)) {
    // Also accept this app's own export shape: { app, version, exportedAt, couriers: [...] }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.couriers)) {
      parsed = parsed.couriers;
    } else {
      return { ok: false, couriers: [], rejected: [], error: 'notArray' };
    }
  }
  const couriers = [];
  const rejected = [];
  const seen = [];
  parsed.forEach((item, index) => {
    const errs = validateCourier(item, seen);
    if (errs.length > 0) {
      rejected.push({ index, reason: errs.join(', ') });
    } else {
      couriers.push(normalizeCourier(item));
      seen.push(item.name.trim());
    }
  });
  return { ok: true, couriers, rejected, error: null };
}

function normalizeCourier(c) {
  const out = { name: c.name.trim(), rates: {} };
  for (const z of ZONES) {
    const r = c.rates[z];
    out.rates[z] = {
      base: r.base,
      perKg: r.perKg,
      codPct: r.codPct,
      minCharge: r.minCharge,
      daysMin: r.daysMin,
      daysMax: r.daysMax,
    };
  }
  if (c.demo) out.demo = true;
  return out;
}

/** Demo sample couriers — clearly labelled DEMO SAMPLE rates, NOT real prices. */
function demoCouriers() {
  return [
    {
      name: 'Demo Express',
      demo: true,
      rates: {
        inside: { base: 60, perKg: 20, codPct: 1, minCharge: 60, daysMin: 1, daysMax: 2 },
        outside: { base: 120, perKg: 30, codPct: 1, minCharge: 120, daysMin: 2, daysMax: 4 },
      },
    },
    {
      name: 'Demo Swift',
      demo: true,
      rates: {
        inside: { base: 80, perKg: 15, codPct: 0, minCharge: 80, daysMin: 1, daysMax: 1 },
        outside: { base: 150, perKg: 25, codPct: 2, minCharge: 150, daysMin: 2, daysMax: 3 },
      },
    },
    {
      name: 'Demo Budget',
      demo: true,
      rates: {
        inside: { base: 45, perKg: 25, codPct: 1.5, minCharge: 50, daysMin: 2, daysMax: 3 },
        outside: { base: 100, perKg: 20, codPct: 1.5, minCharge: 100, daysMin: 3, daysMax: 5 },
      },
    },
  ];
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
function toBengaliDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Format a Taka amount. In Bengali mode digits are converted to Bengali digits. */
function formatMoney(amount, lang) {
  const n = Number(amount);
  const text = Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = '৳' + text;
  return lang === 'bn' ? toBengaliDigits(s) : s;
}

/** Format a plain number (weight, days, counts) per language. */
function formatNumber(value, lang) {
  const s = String(value);
  return lang === 'bn' ? toBengaliDigits(s) : s;
}

const api = {
  MAX_WEIGHT_KG,
  ZONES,
  STORAGE_KEY,
  isNum,
  extraKg,
  validateZoneRates,
  validateCourier,
  validateEstimate,
  computeCost,
  estimateAll,
  sortByInsideBase,
  sortByFastest,
  cheapestInsideBase,
  fastestDelivery,
  validateImport,
  normalizeCourier,
  demoCouriers,
  toBengaliDigits,
  formatMoney,
  formatNumber,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CourierCore = api;
