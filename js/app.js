'use strict';
/* Courier Rate BD — DOM/UI layer. All math/validation lives in js/core.js. */
(function () {
  const Core = window.CourierCore;
  const STRINGS = window.I18N_STRINGS;

  const state = { couriers: [], lang: 'en' };
  let lastEstimate = null; // { weight, zone, codAmount, rows }
  let editingName = null; // original name of the courier being edited
  let compareSort = 'price'; // 'price' | 'fastest'

  const $ = (id) => document.getElementById(id);

  // ---------- i18n ----------
  function t(key, vars) {
    const dict = STRINGS[state.lang] || STRINGS.en;
    let s = dict[key] !== undefined ? dict[key] : (STRINGS.en[key] || key);
    if (vars) {
      for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
    }
    return s;
  }

  function applyI18n() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
  }

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(Core.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.couriers)) {
        const res = Core.validateImport(parsed.couriers);
        state.couriers = res.couriers;
      }
      if (parsed && (parsed.lang === 'en' || parsed.lang === 'bn')) state.lang = parsed.lang;
    } catch (e) {
      state.couriers = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(Core.STORAGE_KEY, JSON.stringify({ couriers: state.couriers, lang: state.lang }));
    } catch (e) {
      /* storage unavailable (e.g. private mode) — app still works in-memory */
    }
  }

  // ---------- helpers ----------
  function money(n) { return Core.formatMoney(n, state.lang); }
  function num(n) { return Core.formatNumber(n, state.lang); }
  function dayRange(r) {
    return t('dayRange', { min: num(r.daysMin), max: num(r.daysMax) });
  }
  function zoneLabel(z) { return t(z === 'inside' ? 'estZoneInside' : 'estZoneOutside'); }

  function showError(id, msg) {
    const el = $(id);
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.textContent = ''; el.hidden = true; }
  }
  function setInvalid(inputId, bad) {
    const el = $(inputId);
    if (el) el.classList.toggle('invalid', !!bad);
  }
  function clearFormErrors(ids) {
    ids.forEach((id) => { showError(id, null); });
  }

  // ---------- render ----------
  function renderDashboard() {
    $('statCouriers').textContent = num(state.couriers.length);
    const cheapest = Core.cheapestInsideBase(state.couriers);
    $('statCheapest').textContent = cheapest === null ? t('statNone') : money(cheapest);
    const fastest = Core.fastestDelivery(state.couriers);
    $('statFastest').textContent = fastest === null
      ? t('statNone')
      : dayRange(fastest);
    $('statLastEstimate').textContent = lastEstimate === null
      ? t('statNone')
      : t('lastEstimateSummary', {
          weight: num(lastEstimate.weight),
          zone: zoneLabel(lastEstimate.zone),
          total: money(lastEstimate.rows[0].cost.total),
        });
  }

  function renderEstimator() {
    const box = $('estimateResults');
    box.innerHTML = '';
    if (state.couriers.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('estEmptyCouriers');
      box.appendChild(p);
      return;
    }
    if (!lastEstimate) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('estEmptyResults');
      box.appendChild(p);
      return;
    }
    for (const row of lastEstimate.rows) {
      const card = document.createElement('div');
      card.className = 'result-card';
      const head = document.createElement('div');
      head.className = 'result-head';
      const name = document.createElement('h4');
      name.className = 'result-name';
      name.textContent = row.courier.name;
      head.appendChild(name);
      if (row.cheapest) {
        const b = document.createElement('span');
        b.className = 'badge badge-cheapest';
        b.textContent = t('estCheapest');
        head.appendChild(b);
      }
      if (row.fastest) {
        const b = document.createElement('span');
        b.className = 'badge badge-fastest';
        b.textContent = t('estFastest');
        head.appendChild(b);
      }
      if (row.courier.demo) {
        const b = document.createElement('span');
        b.className = 'badge badge-demo';
        b.textContent = t('demoBadge');
        head.appendChild(b);
      }
      card.appendChild(head);
      const total = document.createElement('div');
      total.className = 'result-total';
      total.textContent = money(row.cost.total);
      card.appendChild(total);
      const ul = document.createElement('ul');
      ul.className = 'result-breakdown';
      const lines = [
        [t('estBase'), money(row.cost.base)],
        [t('estExtra') + ' (' + num(row.cost.extraKg) + ' ' + t('kgUnit') + ')', money(row.cost.extraCost)],
        [t('estCodFee'), money(row.cost.codFee)],
        [t('estDelivery'), dayRange(row.cost)],
      ];
      for (const [label, value] of lines) {
        const li = document.createElement('li');
        const a = document.createElement('span'); a.textContent = label;
        const b = document.createElement('span'); b.textContent = value;
        li.appendChild(a); li.appendChild(b);
        ul.appendChild(li);
      }
      card.appendChild(ul);
      if (row.cost.minApplied) {
        const p = document.createElement('p');
        p.className = 'min-note';
        p.textContent = t('estMinApplied');
        card.appendChild(p);
      }
      box.appendChild(card);
    }
  }

  function renderCouriers() {
    const grid = $('courierList');
    grid.innerHTML = '';
    $('courierEmpty').hidden = state.couriers.length !== 0;
    for (const c of state.couriers) {
      const card = document.createElement('div');
      card.className = 'courier-card';
      const h = document.createElement('h3');
      h.textContent = c.name;
      if (c.demo) {
        const b = document.createElement('span');
        b.className = 'badge badge-demo';
        b.textContent = t('demoBadge');
        h.appendChild(b);
      }
      card.appendChild(h);
      const p = document.createElement('p');
      p.className = 'courier-rates';
      const inR = c.rates.inside;
      const outR = c.rates.outside;
      const line1 = document.createElement('div');
      line1.innerHTML = '<strong>' + escapeHtml(zoneLabel('inside')) + ':</strong> ' +
        escapeHtml(money(inR.base)) + ' + ' + escapeHtml(money(inR.perKg)) + '/' + escapeHtml(t('kgUnit')) +
        ' · COD ' + escapeHtml(num(inR.codPct)) + '% · ' + escapeHtml(dayRange(inR));
      const line2 = document.createElement('div');
      line2.innerHTML = '<strong>' + escapeHtml(zoneLabel('outside')) + ':</strong> ' +
        escapeHtml(money(outR.base)) + ' + ' + escapeHtml(money(outR.perKg)) + '/' + escapeHtml(t('kgUnit')) +
        ' · COD ' + escapeHtml(num(outR.codPct)) + '% · ' + escapeHtml(dayRange(outR));
      p.appendChild(line1);
      p.appendChild(line2);
      card.appendChild(p);
      const actions = document.createElement('div');
      actions.className = 'courier-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-small';
      editBtn.textContent = t('btnEdit');
      editBtn.addEventListener('click', () => startEdit(c));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-small btn-ghost';
      delBtn.textContent = t('btnDelete');
      delBtn.addEventListener('click', () => deleteCourier(c.name));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      grid.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderCompare() {
    const body = $('compareBody');
    body.innerHTML = '';
    const empty = state.couriers.length === 0;
    $('compareEmpty').hidden = !empty;
    $('compareTable').style.display = empty ? 'none' : '';
    const list = compareSort === 'fastest' ? Core.sortByFastest(state.couriers) : Core.sortByInsideBase(state.couriers);
    for (const c of list) {
      const tr = document.createElement('tr');
      const cells = [
        c.name + (c.demo ? ' (' + t('demoBadge') + ')' : ''),
        money(c.rates.inside.base), money(c.rates.inside.perKg), num(c.rates.inside.codPct) + '%',
        num(c.rates.inside.daysMin) + '–' + num(c.rates.inside.daysMax),
        money(c.rates.outside.base), money(c.rates.outside.perKg), num(c.rates.outside.codPct) + '%',
        num(c.rates.outside.daysMin) + '–' + num(c.rates.outside.daysMax),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        if (i > 0) td.className = 'num';
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  }

  function render() {
    renderDashboard();
    renderEstimator();
    renderCouriers();
    renderCompare();
  }

  // ---------- estimator ----------
  function runEstimate() {
    const weight = parseFloat($('estWeight').value);
    const zone = $('estZone').value;
    const codRaw = $('estCod').value.trim();
    const codAmount = codRaw === '' ? 0 : parseFloat(codRaw);
    const errs = Core.validateEstimate(weight, zone, codAmount);
    showError('errWeight', null); showError('errZone', null); showError('errCod', null);
    setInvalid('estWeight', false); setInvalid('estCod', false);
    if (errs.length > 0) {
      for (const e of errs) {
        if (e === 'weightInvalid' || e === 'weightTooHeavy') {
          showError('errWeight', t('err' + cap(e))); setInvalid('estWeight', true);
        } else if (e === 'codInvalid') {
          showError('errCod', t('errCodInvalid')); setInvalid('estCod', true);
        } else if (e === 'zoneInvalid') {
          showError('errZone', t('errZoneInvalid'));
        }
      }
      lastEstimate = null;
      renderDashboard();
      renderEstimator();
      return false;
    }
    const rows = Core.estimateAll(state.couriers, weight, zone, codAmount);
    lastEstimate = { weight, zone, codAmount, rows };
    renderDashboard();
    renderEstimator();
    return true;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- courier form ----------
  const FIELD_IDS = {
    name: 'cName',
    'inside:base': 'inBase', 'inside:perKg': 'inPerKg', 'inside:codPct': 'inCodPct',
    'inside:minCharge': 'inMin', 'inside:daysMin': 'inDaysMin', 'inside:daysMax': 'inDaysMax',
    'outside:base': 'outBase', 'outside:perKg': 'outPerKg', 'outside:codPct': 'outCodPct',
    'outside:minCharge': 'outMin', 'outside:daysMin': 'outDaysMin', 'outside:daysMax': 'outDaysMax',
  };
  const ERR_IDS = {
    nameRequired: 'errName', nameDuplicate: 'errName',
    'inside:baseInvalid': 'errInBase', 'inside:perKgInvalid': 'errInPerKg',
    'inside:codPctInvalid': 'errInCodPct', 'inside:minChargeInvalid': 'errInMin',
    'inside:daysMinInvalid': 'errInDaysMin', 'inside:daysMaxInvalid': 'errInDaysMax',
    'outside:baseInvalid': 'errOutBase', 'outside:perKgInvalid': 'errOutPerKg',
    'outside:codPctInvalid': 'errOutCodPct', 'outside:minChargeInvalid': 'errOutMin',
    'outside:daysMinInvalid': 'errOutDaysMin', 'outside:daysMaxInvalid': 'errOutDaysMax',
    'inside:zoneMissing': 'errInBase', 'outside:zoneMissing': 'errOutBase',
    ratesMissing: 'errName', courierMissing: 'errName',
  };
  const ALL_ERR_IDS = ['errName', 'errInBase', 'errInPerKg', 'errInCodPct', 'errInMin', 'errInDaysMin', 'errInDaysMax',
    'errOutBase', 'errOutPerKg', 'errOutCodPct', 'errOutMin', 'errOutDaysMin', 'errOutDaysMax'];

  function readCourierForm() {
    const numVal = (id) => {
      const v = $(id).value.trim();
      return v === '' ? NaN : parseFloat(v);
    };
    const intVal = (id) => {
      const v = $(id).value.trim();
      return v === '' ? NaN : Number(v);
    };
    return {
      name: $('cName').value.trim(),
      rates: {
        inside: {
          base: numVal('inBase'), perKg: numVal('inPerKg'), codPct: numVal('inCodPct'),
          minCharge: numVal('inMin'), daysMin: intVal('inDaysMin'), daysMax: intVal('inDaysMax'),
        },
        outside: {
          base: numVal('outBase'), perKg: numVal('outPerKg'), codPct: numVal('outCodPct'),
          minCharge: numVal('outMin'), daysMin: intVal('outDaysMin'), daysMax: intVal('outDaysMax'),
        },
      },
    };
  }

  function fillCourierForm(c) {
    $('cName').value = c.name;
    const set = (id, v) => { $(id).value = v; };
    set('inBase', c.rates.inside.base); set('inPerKg', c.rates.inside.perKg);
    set('inCodPct', c.rates.inside.codPct); set('inMin', c.rates.inside.minCharge);
    set('inDaysMin', c.rates.inside.daysMin); set('inDaysMax', c.rates.inside.daysMax);
    set('outBase', c.rates.outside.base); set('outPerKg', c.rates.outside.perKg);
    set('outCodPct', c.rates.outside.codPct); set('outMin', c.rates.outside.minCharge);
    set('outDaysMin', c.rates.outside.daysMin); set('outDaysMax', c.rates.outside.daysMax);
  }

  function resetCourierForm() {
    $('courierForm').reset();
    editingName = null;
    $('courierSubmit').textContent = t('btnAdd');
    $('courierFormTitle').textContent = t('btnAdd');
    $('courierCancel').hidden = true;
    clearFormErrors(ALL_ERR_IDS);
    Object.values(FIELD_IDS).forEach((id) => setInvalid(id, false));
  }

  function startEdit(c) {
    fillCourierForm(c);
    editingName = c.name;
    $('courierSubmit').textContent = t('btnSave');
    $('courierFormTitle').textContent = t('btnEdit') + ': ' + c.name;
    $('courierCancel').hidden = false;
    clearFormErrors(ALL_ERR_IDS);
    $('courierForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('cName').focus();
  }

  function deleteCourier(name) {
    if (!window.confirm(t('confirmDelete'))) return;
    state.couriers = state.couriers.filter((c) => c.name !== name);
    if (editingName === name) resetCourierForm();
    save();
    render();
  }

  function submitCourierForm() {
    clearFormErrors(ALL_ERR_IDS);
    Object.values(FIELD_IDS).forEach((id) => setInvalid(id, false));
    const courier = readCourierForm();
    const others = state.couriers
      .filter((c) => c.name !== editingName)
      .map((c) => c.name);
    const errs = Core.validateCourier(courier, others);
    if (errs.length > 0) {
      for (const e of errs) {
        const errId = ERR_IDS[e];
        const msgKey = 'err' + cap(e.includes(':') ? e.split(':')[1] : e);
        if (errId) showError(errId, t(msgKey));
        const fieldKey = e.includes(':') ? e.split(':')[0] + ':' + fieldKeyFor(e.split(':')[1]) : 'name';
        const inputId = FIELD_IDS[fieldKey] || FIELD_IDS.name;
        if (inputId) setInvalid(inputId, true);
      }
      return false;
    }
    const clean = Core.normalizeCourier(courier);
    if (editingName !== null) {
      const idx = state.couriers.findIndex((c) => c.name === editingName);
      if (idx >= 0) state.couriers[idx] = clean;
    } else {
      state.couriers.push(clean);
    }
    save();
    resetCourierForm();
    render();
    return true;
  }

  function fieldKeyFor(code) {
    return { baseInvalid: 'base', perKgInvalid: 'perKg', codPctInvalid: 'codPct', minChargeInvalid: 'minCharge', daysMinInvalid: 'daysMin', daysMaxInvalid: 'daysMax' }[code] || 'base';
  }

  // ---------- data tab ----------
  function buildExportJson() {
    return JSON.stringify({
      app: 'courier-rate-bd',
      version: 1,
      exportedAt: new Date().toISOString(),
      couriers: state.couriers,
    }, null, 2);
  }

  function exportData() {
    const blob = new Blob([buildExportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'courier-rate-bd-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const st = $('exportStatus');
    st.textContent = t('exportDone', { n: num(state.couriers.length) });
    st.className = 'status ok';
  }

  function importJsonText(text) {
    const res = Core.validateImport(text);
    const st = $('importStatus');
    if (!res.ok) {
      st.textContent = t('importFailed', { reason: res.error === 'jsonParse' ? 'invalid JSON' : 'top level must be an array of couriers' });
      st.className = 'status err';
      return { added: 0, rejected: res.rejected };
    }
    const existing = state.couriers.map((c) => c.name);
    let added = 0;
    const rejected = [...res.rejected];
    for (const c of res.couriers) {
      if (existing.some((n) => n.toLowerCase() === c.name.toLowerCase())) {
        rejected.push({ index: -1, reason: c.name + ': nameDuplicate' });
      } else {
        state.couriers.push(c);
        existing.push(c.name);
        added++;
      }
    }
    save();
    render();
    const parts = [];
    if (added > 0) parts.push(t('importOk', { n: num(added) }));
    if (rejected.length > 0) {
      parts.push(t('importRejected', {
        n: num(rejected.length),
        list: rejected.slice(0, 5).map((r) => '#' + (r.index >= 0 ? r.index : '?') + ' ' + r.reason).join('; '),
      }));
    }
    st.textContent = parts.join(' ');
    st.className = added > 0 ? 'status ok' : 'status err';
    return { added, rejected };
  }

  function loadDemo() {
    const st = $('demoStatus');
    const hasDemo = state.couriers.some((c) => c.demo);
    if (hasDemo) {
      st.textContent = t('demoExists');
      st.className = 'status err';
      return 0;
    }
    const demo = Core.demoCouriers();
    const existing = state.couriers.map((c) => c.name.toLowerCase());
    let added = 0;
    for (const c of demo) {
      if (!existing.includes(c.name.toLowerCase())) { state.couriers.push(c); added++; }
    }
    save();
    render();
    st.textContent = t('demoLoaded', { n: num(added) });
    st.className = 'status ok';
    return added;
  }

  function eraseAll() {
    const st = $('eraseStatus');
    if ($('eraseConfirm').value !== 'DELETE') {
      st.textContent = t('eraseWrong');
      st.className = 'status err';
      return false;
    }
    state.couriers = [];
    lastEstimate = null;
    editingName = null;
    try { localStorage.removeItem(Core.STORAGE_KEY); } catch (e) { /* ignore */ }
    $('eraseConfirm').value = '';
    resetCourierForm();
    st.textContent = t('eraseDone');
    st.className = 'status ok';
    save();
    render();
    return true;
  }

  // ---------- tabs ----------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  }

  // ---------- init ----------
  function init() {
    load();
    applyI18n();
    render();

    document.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => switchTab(b.getAttribute('data-tab')));
    });
    $('langToggle').addEventListener('click', () => {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      save();
      applyI18n();
      resetCourierForm();
      render();
    });

    $('estimateForm').addEventListener('submit', (e) => { e.preventDefault(); runEstimate(); });
    $('courierForm').addEventListener('submit', (e) => { e.preventDefault(); submitCourierForm(); });
    $('courierCancel').addEventListener('click', resetCourierForm);
    $('sortPrice').addEventListener('click', () => { compareSort = 'price'; renderCompare(); });
    $('sortFastest').addEventListener('click', () => { compareSort = 'fastest'; renderCompare(); });
    $('exportBtn').addEventListener('click', exportData);
    $('importBtn').addEventListener('click', () => {
      const file = $('importFile').files[0];
      const st = $('importStatus');
      if (!file) {
        st.textContent = t('importNoFile');
        st.className = 'status err';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => importJsonText(String(reader.result));
      reader.onerror = () => {
        st.textContent = t('importFailed', { reason: 'could not read file' });
        st.className = 'status err';
      };
      reader.readAsText(file);
    });
    $('demoBtn').addEventListener('click', loadDemo);
    $('eraseBtn').addEventListener('click', eraseAll);
  }

  // Test hooks (used by the headless-Chrome smoke test; harmless in normal use).
  window.__app = {
    get state() { return state; },
    get lastEstimate() { return lastEstimate; },
    t,
    render,
    runEstimate,
    submitCourierForm,
    buildExportJson,
    importJsonText,
    loadDemo,
    eraseAll,
    switchTab,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
