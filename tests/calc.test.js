'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract <script id="core"> from index.html and load via CommonJS module.exports
const coreMatch = html.match(/<script id="core">([\s\S]*?)<\/script>/);
assert(coreMatch, 'Could not find <script id="core"> in index.html');

const sandbox = { module: { exports: {} }, exports: {}, Date, Math, Number, String, Object, Array, RegExp, JSON, isFinite, parseFloat, parseInt };
vm.runInNewContext(coreMatch[1], sandbox, { filename: 'index.html#core' });
const core = sandbox.module.exports;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS:', name);
}
function near(actual, expected, tol, msg) {
  tol = tol == null ? 1e-6 : tol;
  assert(
    typeof actual === 'number' && isFinite(actual) && Math.abs(actual - expected) <= tol,
    (msg || 'near failed') + ': expected ' + expected + ' ± ' + tol + ', got ' + actual
  );
}

// 1. HTML structure & Requirements compliance checks
test('HTML structure, MODULE markers, no emojis/forbidden text, 15 collapsible metrics', () => {
  assert(html.trim().endsWith('</html>'), 'index.html must end with </html>');
  const modules = [...html.matchAll(/\/\* ==== \[MODULE: ([A-Z0-9-]+)\] ==== \*\//g)].map(m => m[1]);
  assert(modules.length >= 20, 'Expected at least 20 MODULE markers, found ' + modules.length);

  // Check syntax of all <script> tags
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.strictEqual(scripts.length, 3, 'Expected 3 script blocks');
  scripts.forEach((s, idx) => new vm.Script(s, { filename: 'script-' + idx + '.js' }));

  // Check forbidden text and emojis (Req 5.1, 5.2, 7)
  assert(!html.includes('100% 本地端離線運算'), 'Must not contain forbidden boilerplate text');
  assert(!/[▼▲✕✖✓✔★☆💡📊📈📉💰💵🏦⚠️🚨🔥🎯]/.test(html), 'Must not contain decorative symbols or emojis');
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert(!emojiRegex.test(html), 'Must not contain Unicode emojis');

  // Check 15 metrics in METRICS array, none starting with numbers like "1. "
  const metricsMatch = html.match(/const METRICS = \[([\s\S]*?)\];/);
  assert(metricsMatch, 'METRICS definition must exist');
  const titles = [...metricsMatch[1].matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]);
  assert.strictEqual(titles.length, 15, 'Must have all 15 tracked metrics');
  titles.forEach(t => {
    assert(!/^\d+[\.\s、]/.test(t), 'Metric title must not be numbered: ' + t);
  });

  // Check collapsible <details class="def"> and theme toggle button
  assert(html.includes('<details class="def"><summary>定義</summary>'), 'Each metric card must have collapsible <details>');
  assert(html.includes('id="btnTheme"'), 'Day/Night mode button must exist');
  assert(html.includes('[data-theme="dark"]'), 'Dark mode CSS rules must exist');
});

// 2. Loan amortization & interest-only calculations
test('Loan PMT(1,000,000, 3%, 84) = 13,213.30 ± 0.01, remaining balance, and interest-only loans', () => {
  const pmt = core.loanPayment(1000000, 3, 84);
  near(pmt, 13213.30, 0.01, 'PMT(1000000, 3%, 84)');

  // Remaining balance at k=0 is principal, at k=84 is 0
  near(core.loanBalance(1000000, 3, 84, 0), 1000000, 1e-6, 'Balance at k=0');
  near(core.loanBalance(1000000, 3, 84, 84), 0, 1e-6, 'Balance at k=84');
  near(core.loanBalance(1000000, 3, 84, 90), 0, 1e-6, 'Balance at k>n');

  // Verify remaining principal after 12 payments matches amortization schedule
  const sched = core.amortSchedule(1000000, 3, 84);
  assert.strictEqual(sched.length, 84);
  near(core.loanBalance(1000000, 3, 84, 12), sched[11].balance, 1e-4, 'Balance at k=12 matches schedule');
  near(sched[83].balance, 0, 1e-6, 'Schedule ends at 0 balance');

  // 0% interest rate amortized loan
  near(core.loanPayment(120000, 0, 12), 10000, 1e-6, '0% loan PMT');
  near(core.loanBalance(120000, 0, 12, 3), 90000, 1e-6, '0% loan balance after 3 terms');

  // Interest-only loan (term = 0)
  const ioLoan = { name: '質押', type: '質押', principal: 300000, rate: 2.5, term: 0, paid: 0, startDate: '' };
  const ioSum = core.loanSummary(ioLoan, '2026-10-23');
  assert.strictEqual(ioSum.interestOnly, true);
  near(ioSum.balance, 300000, 1e-6, 'Interest-only balance remains principal');
  near(ioSum.payment, 300000 * 0.025 / 12, 1e-6, 'Interest-only monthly payment = monthly interest');
  assert.strictEqual(ioSum.remainingTerms, null);
});

// 3. XIRR calculation (Newton + bisection fallback, mixed positive/negative cashflows)
test('XIRR accuracy on single-period, multi-period, withdrawals, and extreme bisection cases', () => {
  // Exact 10% over 365 days
  const t0 = core.parseDate('2025-01-01');
  const t1 = core.parseDate('2026-01-01');
  const r1 = core.xirr([{ date: t0, amount: -100000 }, { date: t1, amount: 110000 }]);
  near(r1, 0.10, 1e-7, '1-year 10% XIRR');

  // Mixed positive and negative cashflows (contributions + intermediate withdrawal + final value)
  const flows = [
    { date: core.parseDate('2022-01-01'), amount: -500000 },
    { date: core.parseDate('2023-01-01'), amount: -200000 },
    { date: core.parseDate('2024-01-01'), amount: 100000 }, // withdrawal
    { date: core.parseDate('2025-01-01'), amount: 800000 }  // terminal value
  ];
  const r2 = core.xirr(flows);
  assert(r2 !== null && isFinite(r2), 'Mixed cashflows XIRR must converge');
  // Verify NPV at r2 is 0
  const npv = flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + r2, (f.date - flows[0].date) / 86400000 / 365), 0);
  near(npv, 0, 1e-3, 'NPV at XIRR root must be 0');

  // High-return case and negative-return case (tests Newton + bisection robustness)
  const rHigh = core.xirr([{ date: t0, amount: -1000 }, { date: t1, amount: 15000 }]); // +1400%
  near(rHigh, 14.0, 1e-5, 'High return XIRR');
  const rNeg = core.xirr([{ date: t0, amount: -1000 }, { date: t1, amount: 100 }]); // -90%
  near(rNeg, -0.90, 1e-6, 'Negative return XIRR');

  // Non-monotonic cashflows that can trip plain Newton without fallback
  const tricky = [
    { date: t0, amount: -1000 },
    { date: t0 + 180 * 86400000, amount: 3000 },
    { date: t0 + 365 * 86400000, amount: -2500 },
    { date: t0 + 730 * 86400000, amount: 1000 }
  ];
  const rTricky = core.xirr(tricky);
  assert(rTricky !== null && isFinite(rTricky), 'Tricky cashflow XIRR should converge via Newton or bisection');
  const npvTricky = tricky.reduce((acc, f) => acc + f.amount / Math.pow(1 + rTricky, (f.date - t0) / 86400000 / 365), 0);
  near(npvTricky, 0, 1e-3, 'NPV at tricky root must be 0');

  // Invalid cashflows (all same sign or <2 flows) -> null
  assert.strictEqual(core.xirr([{ date: t0, amount: -1000 }, { date: t1, amount: -500 }]), null);
  assert.strictEqual(core.xirr([{ date: t0, amount: 1000 }]), null);
});

// 4. Core metrics: leverage, exposure, net worth, maintenance ratio, DSR, dry powder, allocation deviation
test('All financial metrics in computeAll match independent hand calculations', () => {
  const s = core.defaultState();
  const m = core.computeAll(s, '2026-10-23');

  // TW stocks:
  // 0050: 6000 * 195 = 1,170,000 (cost 6000 * 150 = 900,000, lev 1 -> exp 1,170,000, pledged = true, irr = 10%)
  // 00631L: 20000 * 23 = 460,000 (cost 20000 * 18 = 360,000, lev 2 -> exp 920,000, pledged = false, irr = 18%)
  near(m.twMV, 1630000, 1e-6, 'twMV');
  near(m.twCost, 1260000, 1e-6, 'twCost');
  near(m.twRet, (1630000 - 1260000) / 1260000, 1e-9, 'twRet');
  near(m.twExp, 2090000, 1e-6, 'twExp');

  // US stocks (fx = 32):
  // VOO: 40 * 540 = 21,600 USD = 691,200 TWD (cost 40 * 450 = 18,000 USD = 576,000 TWD, ret = +20%, lev 1)
  near(m.usMV, 691200, 1e-6, 'usMV');
  near(m.usCost, 576000, 1e-6, 'usCost');
  near(m.usRet, 0.20, 1e-9, 'usRet');
  near(m.usExp, 691200, 1e-6, 'usExp');

  // Cash: 300,000 + 2,000 * 32 = 364,000
  near(m.cash, 364000, 1e-6, 'cash');
  near(m.totalAssets, 1630000 + 691200 + 364000, 1e-6, 'totalAssets = 2,685,200');

  // Loans:
  // Loan 1: 1,000,000 @ 3%, 84m, paid 12 -> bal = 869,957.69..., pmt = 13,213.30
  // Loan 2: 300,000 @ 2.5%, 0m (質押) -> bal = 300,000, pmt = 625
  const bal1 = core.loanBalance(1000000, 3, 84, 12);
  const pmt1 = core.loanPayment(1000000, 3, 84);
  near(m.debt, bal1 + 300000, 1e-4, 'total debt');
  near(m.monthlyDebt, pmt1 + 625, 1e-4, 'monthly debt service');
  near(m.netWorth, m.totalAssets - m.debt, 1e-4, 'netWorth');

  // Exposure & Leverage
  near(m.exposure, 2090000 + 691200, 1e-6, 'total exposure = 2,781,200');
  near(m.leverage, m.exposure / m.netWorth, 1e-9, 'leverage');
  near(m.debtRatio, m.debt / m.totalAssets, 1e-9, 'debtRatio');

  // Maintenance ratio & safety distance:
  // Pledged MV = 1,170,000 (0050), marginDebt = 300,000 (股票質押) -> maint = 3.9 (390%)
  near(m.pledgedMV, 1170000, 1e-6, 'pledgedMV');
  near(m.marginDebt, 300000, 1e-6, 'marginDebt');
  near(m.maint, 3.9, 1e-9, 'maint = 390%');
  near(m.dropToCall, 1 - 1.30 / 3.9, 1e-9, 'dropToCall = 66.67%');
  near(m.dropToWarn, 1 - 1.60 / 3.9, 1e-9, 'dropToWarn');

  // DSR & Dry Powder
  near(m.dsr, m.monthlyDebt / 80000, 1e-9, 'DSR');
  near(m.dryPowder, 364000 + 500000, 1e-6, 'dryPowder = 864,000');
  near(m.dryMonths, 864000 / (35000 + m.monthlyDebt), 1e-6, 'dryMonths');

  // Allocation Deviation
  const twW = m.twMV / m.totalAssets, usW = m.usMV / m.totalAssets, cashW = m.cash / m.totalAssets;
  near(m.alloc[0].dev, twW - 0.50, 1e-9, 'tw weight dev');
  near(m.alloc[1].dev, usW - 0.30, 1e-9, 'us weight dev');
  near(m.alloc[2].dev, cashW - 0.20, 1e-9, 'cash weight dev');
  near(m.allocDevTotal, Math.abs(twW - 0.5) + Math.abs(usW - 0.3) + Math.abs(cashW - 0.2), 1e-9, 'allocDevTotal');

  // Advice sanity check: deleveraging advice never suggests paying debt with existing cash
  s.targets.leverage = 1.0;
  const mHighLev = core.computeAll(s, '2026-10-23');
  const adv = core.buildAdvice(mHighLev, s.targets);
  const levAdv = adv.find(a => a.key === 'leverage');
  assert(levAdv && levAdv.title === '降槓桿', 'Should advise deleveraging when leverage > target + band');
  assert(levAdv.text.includes('以帳上現金償還負債不會降低槓桿'), 'Deleveraging advice must clarify cash debt repayment does not reduce leverage');
});

// 5. Weighted official IRR & 10/20/30-year projection (nominal & real)
test('Weighted official IRR and 10/20/30-year projections (nominal & real)', () => {
  const s = core.defaultState();
  const m = core.computeAll(s, '2026-10-23');

  // Expected weighted IRR = (1,170,000*0.10 + 460,000*0.18 + 691,200*0.10 + 364,000*0.01) / 2,685,200
  const expectedIrr = (1170000 * 0.10 + 460000 * 0.18 + 691200 * 0.10 + 364000 * 0.01) / 2685200;
  near(m.weightedIrr, expectedIrr, 1e-9, 'weightedIrr');

  const pNom = core.project({
    assets: m.totalAssets, loans: s.loans, today: '2026-10-23',
    rate: m.weightedIrr, inflation: 0.02, real: false, monthly: 20000, years: 30
  });
  assert.strictEqual(pNom.rows.length, 31, '0..30 years = 31 rows');
  near(pNom.rows[0].assets, m.totalAssets, 1e-6, 'Year 0 assets');
  near(pNom.rows[0].debt, m.debt, 1e-6, 'Year 0 debt');

  // After 10 years (120 months), the 84-term amortized loan is fully paid off; only the 300,000 interest-only loan remains
  near(pNom.rows[10].debt, 300000, 1e-6, 'Year 10 nominal debt (84m loan paid off, IO loan remains)');
  near(pNom.rows[20].debt, 300000, 1e-6, 'Year 20 nominal debt');
  near(pNom.rows[30].debt, 300000, 1e-6, 'Year 30 nominal debt');
  assert(pNom.rows[30].netWorth > pNom.rows[20].netWorth && pNom.rows[20].netWorth > pNom.rows[10].netWorth, 'Net worth grows across 10/20/30yr');

  // Real (inflation-adjusted) projection
  const pReal = core.project({
    assets: m.totalAssets, loans: s.loans, today: '2026-10-23',
    rate: m.weightedIrr, inflation: 0.02, real: true, monthly: 20000, years: 30
  });
  near(pReal.rate, (1 + m.weightedIrr) / 1.02 - 1, 1e-9, 'Fisher real rate');
  near(pReal.rows[10].debt, 300000 / Math.pow(1.02, 10), 1e-4, 'Year 10 real debt discounted by inflation');
  assert(pReal.rows[30].assets < pNom.rows[30].assets, 'Real projected assets < nominal projected assets when inflation > 0');
});

// 6. Empty string / invalid input safety & deep merge on partial state load
test('Input sanitization (num) and deepMerge / normalizeState / migrateV0 resilience', () => {
  assert.strictEqual(core.num(''), 0);
  assert.strictEqual(core.num('   '), 0);
  assert.strictEqual(core.num(null), 0);
  assert.strictEqual(core.num(undefined), 0);
  assert.strictEqual(core.num(NaN), 0);
  assert.strictEqual(core.num(Infinity), 0);
  assert.strictEqual(core.num('abc'), 0);
  near(core.num('1,234,567.89'), 1234567.89, 1e-6);
  near(core.num('１，２３４.５'), 1234.5, 1e-6, 'Fullwidth digits and comma');

  // Empty strings in state fields must never cause string concatenation or NaN
  const dirty = core.normalizeState({
    fx: { usdTwd: '' },
    cash: { twd: '', usd: '1,000', unusedCredit: null, monthlyIncome: 'abc' },
    tw: [{ symbol: '0050', shares: '1000', avg: '', price: '200' }],
    us: [{}],
    loans: [{ principal: '500000', rate: '', term: '' }]
  });
  assert.strictEqual(typeof dirty.cash.twd, 'number');
  assert.strictEqual(dirty.cash.twd, 0);
  assert.strictEqual(dirty.cash.usd, 1000);
  assert.strictEqual(dirty.targets.maintWarn, 160, 'Missing target fields filled from defaults');

  const mDirty = core.computeAll(dirty, '2026-10-23');
  assert.strictEqual(typeof mDirty.totalAssets, 'number');
  assert(isFinite(mDirty.totalAssets), 'totalAssets must be a finite number, not NaN or concatenated string');
  near(mDirty.totalAssets, 200000, 1e-6);

  // Legacy v0 state migration
  const v0 = {
    params: { usdCurRate: 31.5, twdCash: 100000, usdCash: 500, targetLev: 1.8, marginCallLine: 130, targetTwPct: 60, targetUsPct: 20, targetCashPct: 20 },
    twStocks: [{ symbol: '2330', shares: 1000, avgPrice: 600, curPrice: 900, lev: 1, pledged: true }],
    loans: [{ name: '質押', type: 'interest_only', isMargin: true, balance: 200000, rate: 2.5, periods: 0 }],
    cashflows: [{ date: '2024-01-01', amount: -500000 }]
  };
  const migrated = core.normalizeState(v0);
  near(migrated.fx.usdTwd, 31.5, 1e-6);
  assert.strictEqual(migrated.tw[0].symbol, '2330');
  near(migrated.tw[0].price, 900, 1e-6);
  assert.strictEqual(migrated.loans[0].type, '質押');
  assert.strictEqual(migrated.cashflows[0].type, 'out');
  near(migrated.cashflows[0].amount, 500000, 1e-6);
});

// 7. UI script execution & DOM rendering smoke test
test('UI script initializes and renders all 15 metric cards, tables, and SVG charts without errors', () => {
  const uiMatch = html.match(/<script id="ui">([\s\S]*?)<\/script>/);
  assert(uiMatch, 'Could not find <script id="ui"> in index.html');

  const elements = {};
  function makeEl(id) {
    return {
      id: id || '',
      innerHTML: '',
      textContent: '',
      value: '',
      hidden: false,
      open: true,
      className: '',
      style: {},
      clientWidth: 800,
      classList: { contains: () => true },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || '0'; },
      addEventListener() {},
      getBoundingClientRect() { return { left: 0, width: 800 }; },
      querySelector() { return makeEl(); },
      querySelectorAll() { return [makeEl(), makeEl(), makeEl()]; }
    };
  }
  const getEl = (sel) => {
    const id = sel.replace(/^#/, '');
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  };
  const storage = {};
  const docEl = makeEl('html');
  docEl['data-theme'] = 'light';
  const uiSandbox = Object.assign({}, sandbox, {
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener() {}
    },
    document: {
      documentElement: docEl,
      querySelector: getEl,
      querySelectorAll: () => [],
      getElementById: getEl,
      addEventListener() {}
    },
    localStorage: {
      getItem: (k) => storage[k] || null,
      setItem: (k, v) => { storage[k] = String(v); }
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: () => 1,
    clearTimeout: () => {}
  });
  vm.runInNewContext(coreMatch[1] + '\n' + uiMatch[1], uiSandbox, { filename: 'index.html#full' });

  // Verify 15 metric cards rendered and populated
  assert(elements.metrics.innerHTML.includes('id="m-lev"'), 'Leverage card rendered');
  assert(elements.metrics.innerHTML.includes('id="m-xirr"'), 'XIRR card rendered');
  assert(elements.projChart.innerHTML.includes('<svg'), 'Projection SVG chart rendered');
  assert(elements.histChart.innerHTML.includes('<svg'), 'History SVG chart rendered');
  assert(elements.projTable.innerHTML.includes('第 10 年') && elements.projTable.innerHTML.includes('第 20 年') && elements.projTable.innerHTML.includes('第 30 年'), 'Projection 10/20/30yr rows rendered');
  assert(storage['finTracker.state'], 'State saved to localStorage');
});

console.log('\nAll ' + passed + ' test suites passed!');
