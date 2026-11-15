// Dilution Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the board, the crowd lab, the validation, the set
// aside list and the live tokens. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var rows = DATA.rows;

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtInt(n) { return n === null || n === undefined ? 'n/a' : Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtX(n) { return n === null || n === undefined ? 'n/a' : '×' + n.toFixed(2); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pill(v) { return '<span class="pill ' + v + '">' + v + '</span>'; }
  function verdictFor(net, nph) {
    if (net >= M.verdict_robust_net && nph >= M.verdict_robust_per_hour) return 'ROBUST';
    if (net >= M.verdict_farm_net) return 'FARM';
    if (net > M.verdict_thin_net) return 'THIN';
    return 'SKIP';
  }
  function $(id) { return document.getElementById(id); }

  // ---- header ----
  var vc = DATA.verdict_counts;
  $('meta').innerHTML =
    '<dt>Snapshot</dt><dd>' + esc(DATA.as_of) + '</dd>' +
    '<dt>Board</dt><dd>' + DATA.board_size + ' rows</dd>' +
    '<dt>Verdicts $1K</dt><dd>' + vc.robust + ' / ' + vc.farm + ' / ' + vc.thin + ' / ' + vc.skip + '</dd>' +
    '<dt>Median crowd</dt><dd>×' + DATA.crowd.crowd_factor_median.toFixed(2) + ' (' + fmtInt(DATA.crowd.median_farmers) + ' farmers)</dd>' +
    '<dt>Curve</dt><dd>R² ' + DATA.curve.r2.toFixed(2) + ' · LOO ×' + DATA.curve.loo_miss.toFixed(2) + '</dd>';
  $('asof').textContent = DATA.as_of;
  $('source').textContent = DATA.source;

  // ---- tabs + hash state ----
  var state = { tab: 'board', q: '', verdict: '', sort: 'diluted', detail: null };
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    state.tab = h.get('tab') || 'board';
    state.q = h.get('q') || '';
    state.verdict = h.get('verdict') || '';
    state.sort = h.get('sort') || 'diluted';
    state.detail = h.get('detail') || null;
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.tab !== 'board') h.set('tab', state.tab);
    if (state.q) h.set('q', state.q);
    if (state.verdict) h.set('verdict', state.verdict);
    if (state.sort !== 'diluted') h.set('sort', state.sort);
    if (state.detail) h.set('detail', state.detail);
    history.replaceState(null, '', '#' + h.toString());
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    document.querySelectorAll('main .tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + tab); });
    writeHash();
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab); });
  });

  // ---- board ----
  var boardBody = document.querySelector('#board tbody');
  function boardRows() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().includes(q);
    });
    var key = {
      diluted: function (r) { return -r.implied_value_usd; },
      crowd: function (r) { return -r.crowd_factor; },
      tvl: function (r) { return -r.tvl_usd; },
      prob: function (r) { return -r.launch_probability; },
      net: function (r) { return -r.tiers[1].net_usd; },
      flip: function (r) { return r.flip_mult === null ? Infinity : -r.flip_mult; },
    }[state.sort];
    return list.sort(function (a, b) { return key(a) - key(b) || a.rank - b.rank; });
  }
  function renderBoard() {
    var list = boardRows();
    $('count').textContent = list.length + ' of ' + rows.length + ' rows';
    boardBody.innerHTML = list.map(function (r) {
      var t = r.tiers[1];
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td>' + esc(r.name) + '</td><td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + (r.age_days === null ? 'n/a' : r.age_days + 'd') + '</td>' +
        '<td class="num">' + r.launch_probability.toFixed(2) + '</td>' +
        '<td class="num">' + fmtUsd(r.implied_if_launched_usd) + '</td>' +
        '<td class="num">' + fmtUsd(r.expected_value_usd) + '</td>' +
        '<td class="num crowd">' + fmtX(r.crowd_factor) + '</td>' +
        '<td class="num">' + fmtInt(r.farmers) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + fmtUsd(r.band_low_usd) + '–' + fmtUsd(r.band_high_usd) + '</td>' +
        '<td>' + pill(r.verdict) + '</td>' +
        '<td class="num">' + (t.net_usd >= 0 ? '+' : '') + '$' + t.net_usd.toFixed(2) + '</td>' +
        '<td class="num">' + (r.flip_mult === null ? '—' : fmtX(r.flip_mult)) + '</td></tr>';
    }).join('');
  }
  boardBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDrawer(tr.dataset.slug);
  });
  $('q').addEventListener('input', function () { state.q = this.value; renderBoard(); writeHash(); });
  $('verdict').addEventListener('change', function () { state.verdict = this.value; renderBoard(); writeHash(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; renderBoard(); writeHash(); });

  // ---- detail drawer ----
  var drawer = $('drawer'), drawerBody = $('drawerBody');
  function openDrawer(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    state.detail = slug;
    var t1 = r.tiers[1];
    var crowdCut = t1.slice_before_usd - t1.slice_usd;
    var sens = r.sensitivity.map(function (s) {
      return '<tr><td class="num">' + s.mult + '×</td><td class="num">' + fmtUsd(s.slice_usd) + '</td>' +
        '<td class="num">' + (s.net_usd >= 0 ? '+' : '') + '$' + s.net_usd.toFixed(2) + '</td><td>' + pill(s.verdict) + '</td></tr>';
    }).join('');
    var tiers = r.tiers.map(function (t) {
      return '<tr><td class="num">$' + fmtInt(t.capital_usd) + '</td><td class="num">' + fmtUsd(t.slice_before_usd) + '</td>' +
        '<td class="num">' + fmtUsd(t.slice_usd) + '</td><td class="num">$' + t.gas_usd + '</td>' +
        '<td class="num">' + (t.net_usd >= 0 ? '+' : '') + '$' + t.net_usd.toFixed(2) + '</td>' +
        '<td class="num">$' + t.net_per_hour_usd.toFixed(2) + '/h</td><td>' + pill(t.verdict) + '</td></tr>';
    }).join('');
    drawerBody.innerHTML =
      '<h2>' + esc(r.name) + '</h2><p class="note">Rank ' + r.rank + ' · ' + esc(r.category || 'uncategorised') +
      ' · ' + esc(r.chains.join(', ') || 'no chain listed') + ' · ' + (r.age_days === null ? 'age unknown' : r.age_days + ' days old') + '</p>' +
      '<h3>Value</h3><dl>' +
      '<dt>Fitted launch value</dt><dd>' + fmtUsd(r.implied_if_launched_usd) + '</dd>' +
      '<dt>Launch probability (' + esc(r.launch_cell) + ')</dt><dd>' + r.launch_probability.toFixed(2) + '</dd>' +
      '<dt>Expected value, before the crowd</dt><dd>' + fmtUsd(r.expected_value_usd) + '</dd>' +
      '<dt>Value band (LOO ×' + DATA.curve.loo_miss.toFixed(2) + ', diluted)</dt><dd>' + fmtUsd(r.band_low_usd) + ' – ' + fmtUsd(r.band_high_usd) + '</dd>' +
      '<dt>Diluted value (the ranking)</dt><dd><b>' + fmtUsd(r.implied_value_usd) + '</b></dd></dl>' +
      '<h3>Crowd</h3><dl>' +
      '<dt>Estimated rival farmers</dt><dd class="crowdline">' + fmtInt(r.farmers) + '</dd>' +
      '<dt>Crowd factor</dt><dd class="crowdline">' + fmtX(r.crowd_factor) + '</dd>' +
      '<dt>Your slice before the crowd ($1,000)</dt><dd>' + fmtUsd(t1.slice_before_usd) + '</dd>' +
      '<dt>Your slice after the crowd ($1,000)</dt><dd>' + fmtUsd(t1.slice_usd) + '</dd>' +
      '<dt>What the crowd takes</dt><dd class="crowdline">' + fmtUsd(crowdCut) + '</dd>' +
      '<dt>Crowd-flip multiple</dt><dd>' + (r.flip_mult === null ? 'more than 1,000×' : fmtX(r.flip_mult)) + '</dd>' +
      '<dt>Walk-away value fall</dt><dd>' + (r.walk_away_tvl_fall_pct === null ? 'even the full fitted value does not cover costs' : r.walk_away_tvl_fall_pct + '%') + '</dd>' +
      '<dt>Break-even capital</dt><dd>' + (r.break_even_capital_usd === null ? 'never' : '$' + fmtInt(r.break_even_capital_usd)) + '</dd></dl>' +
      '<h3>Crowd sensitivity at $1,000</h3><div class="tablewrap"><table><thead><tr><th>Crowd</th><th>Slice</th><th>Net</th><th>Verdict</th></tr></thead><tbody>' + sens + '</tbody></table></div>' +
      '<h3>Farm plan</h3><dl>' +
      '<dt>Gas (4 transactions)</dt><dd>$' + r.gas_usd + '</dd>' +
      '<dt>Hold</dt><dd>' + r.hold_days + ' days</dd>' +
      '<dt>Verdict at $1,000</dt><dd>' + pill(r.verdict) + '</dd></dl>' +
      '<div class="tablewrap"><table><thead><tr><th>Capital</th><th>Slice before</th><th>Slice</th><th>Gas</th><th>Net</th><th>Net/h</th><th>Verdict</th></tr></thead><tbody>' + tiers + '</tbody></table></div>' +
      '<h3>Steps</h3><ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    drawer.hidden = false;
    writeHash();
  }
  $('drawerClose').addEventListener('click', function () { drawer.hidden = true; state.detail = null; writeHash(); });

  // ---- crowd lab ----
  function labCalc(r, mult, ticket) {
    var ratio = r.crowd_factor - 1;
    var cf = 1 + mult * ratio;
    var diluted = r.expected_value_usd / cf;
    var slice = M.farmer_share * r.launch_probability * r.implied_if_launched_usd * ticket / r.tvl_usd / cf;
    var opp = ticket * M.tbill_rate * (r.hold_days / 365);
    var net = slice - r.gas_usd - opp;
    var verdict = verdictFor(net, net / r.tiers[1].hours);
    return { cf: cf, diluted: diluted, net: net, verdict: verdict };
  }
  function renderLab() {
    var mult = parseFloat($('mult').value);
    var ticket = parseInt($('ticket').value, 10);
    $('multOut').textContent = mult + '×';
    $('ticketOut').textContent = '$' + fmtInt(ticket);
    var scored = rows.map(function (r) {
      var c = labCalc(r, mult, ticket);
      return { r: r, cf: c.cf, diluted: c.diluted, net: c.net, verdict: c.verdict };
    }).sort(function (a, b) { return b.diluted - a.diluted; });
    var counts = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
    scored.forEach(function (s) { counts[s.verdict]++; });
    $('labSummary').innerHTML = 'At a ' + mult + '× crowd and a $' + fmtInt(ticket) + ' ticket: ' +
      '<b>' + counts.ROBUST + ' ROBUST · ' + counts.FARM + ' FARM · ' + counts.THIN + ' THIN · ' + counts.SKIP + ' SKIP</b>. ' +
      'Compare the base 1× / $1,000: ' + vc.robust + ' / ' + vc.farm + ' / ' + vc.thin + ' / ' + vc.skip + '.';
    $('labTop').querySelector('tbody').innerHTML = scored.slice(0, 20).map(function (s, i) {
      var move = s.r.rank - (i + 1);
      return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(s.r.name) + '</td>' +
        '<td class="num crowd">' + fmtX(s.cf) + '</td><td class="num"><b>' + fmtUsd(s.diluted) + '</b></td>' +
        '<td class="num">' + (s.net >= 0 ? '+' : '') + '$' + s.net.toFixed(2) + '</td>' +
        '<td>' + pill(s.verdict) + '</td>' +
        '<td class="num">' + (move > 0 ? '↑' + move : move < 0 ? '↓' + (-move) : '—') + '</td></tr>';
    }).join('');
    var movers = scored.map(function (s, i) { return { r: s.r, from: s.r.rank, to: i + 1, verdict: s.verdict }; })
      .filter(function (m) { return Math.abs(m.from - m.to) >= 10; })
      .sort(function (a, b) { return Math.abs(b.from - b.to) - Math.abs(a.from - a.to); })
      .slice(0, 20);
    $('labMovers').querySelector('tbody').innerHTML = movers.length ? movers.map(function (m) {
      var move = m.from - m.to;
      return '<tr><td>' + esc(m.r.name) + '</td><td class="num">' + m.from + '</td><td class="num">' + m.to + '</td>' +
        '<td class="num">' + (move > 0 ? '↑' + move : '↓' + (-move)) + '</td><td>' + pill(m.verdict) + '</td></tr>';
    }).join('') : '<tr><td colspan="5">No row moves 10 or more ranks at this crowd.</td></tr>';
  }
  $('mult').addEventListener('input', renderLab);
  $('ticket').addEventListener('input', renderLab);

  // ---- validation ----
  (function renderValidation() {
    var c = DATA.curve, L = DATA.launch;
    var terms = c.term_tests.map(function (t) {
      return '<tr><td>' + esc(t.name) + '</td><td class="num">×' + t.loo_miss.toFixed(2) + '</td><td>' + (t.kept ? 'kept' : 'dropped — no out-of-sample win') + '</td></tr>';
    }).join('');
    var cells = L.cells.map(function (cell) {
      return '<tr><td>' + esc(cell.age) + '</td><td>' + esc(cell.tvl) + '</td><td class="num">' + cell.rate.toFixed(2) + '</td><td class="num">' + cell.n + '</td><td class="num">' + cell.tokenized + '</td></tr>';
    }).join('');
    var kTests = L.holdout_k_tested.map(function (k) {
      return '<tr><td class="num">k = ' + k.k + '</td><td class="num">' + k.mae.toFixed(3) + '</td><td>' + (k.k === L.shrinkage_k ? 'selected' : '') + '</td></tr>';
    }).join('');
    var sens = DATA.crowd.sensitivity.map(function (s) {
      return '<tr><td class="num">' + s.crowd_mult + '×</td><td class="num">' + s.robust + '</td><td class="num">' + s.farm + '</td><td class="num">' + s.thin + '</td><td class="num">' + s.skip + '</td></tr>';
    }).join('');
    $('validation').innerHTML =
      '<h3>The size curve</h3><p>log10(market cap) = ' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) +
      ' × log10(TVL), fitted on ' + c.comps + ' live-token comps with TVL &gt; 0 and market cap &gt; 0. ' +
      'R² ' + c.r2.toFixed(3) + ' — the curve is wide, so every value is a band, not a point. ' +
      'Leave-one-out median miss ×' + c.loo_miss.toFixed(2) + ' (Huber ×' + c.huber_loo_miss.toFixed(2) + '); ' +
      'time-split (fit ' + c.time_split_fit + ' comps listed before 2025-01-01, test ' + c.time_split_test + ') ×' + c.time_split_miss.toFixed(2) + '.</p>' +
      '<h3>Fitted terms that were tested and dropped</h3><div class="tablewrap"><table><thead><tr><th>Model</th><th class="num">LOO miss</th><th>Decision</th></tr></thead><tbody>' + terms + '</tbody></table></div>' +
      '<h3>Launch probability — age × TVL, shrunk toward the global rate</h3><p>Global launch rate ' + L.global_rate.toFixed(3) +
      '. The 2-way table (age × TVL) was chosen over a 3-way table (age × TVL × category): the 3-way holdout MAE is ' +
      L.three_way_mae.toFixed(3) + ' against ' + L.holdout_mae.toFixed(3) + ' for the 2-way, because the 3-way cells are too thin. ' +
      'Shrinkage k is picked by a deterministic slug-hash 50/50 holdout. Caveat: survivor bias — protocols that launched are the ones that survived long enough to be listed, so the table overstates the chance for a young protocol.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Age</th><th>TVL</th><th class="num">Rate</th><th class="num">n</th><th class="num">Launched</th></tr></thead><tbody>' + cells + '</tbody></table></div>' +
      '<h3>Shrinkage, chosen by holdout</h3><div class="tablewrap"><table><thead><tr><th class="num">k</th><th class="num">Holdout MAE</th><th></th></tr></thead><tbody>' + kTests + '</tbody></table></div>' +
      '<h3>The crowd</h3><p>Estimated rival farmers N = TVL ÷ $' + fmtInt(DATA.crowd.ticket_usd) +
      ' (the typical ticket). The board median N is ' + fmtInt(DATA.crowd.median_farmers) +
      ', so the crowd factor is 1 + N ÷ ' + fmtInt(DATA.crowd.median_farmers) +
      '. The ticket cancels out of the ranking — N ÷ median N is a ratio of TVLs — but it sets the absolute farmer counts. ' +
      'Median factor ×' + DATA.crowd.crowd_factor_median.toFixed(2) + ', p90 ×' + DATA.crowd.crowd_factor_p90.toFixed(2) +
      ', max ×' + DATA.crowd.crowd_factor_max.toFixed(2) + '. The farmer count is an upper-bound proxy, not a census: it assumes every dollar of TVL belongs to a separate $1,000 farmer, which overstates the crowd for protocols with large single deposits. The sensitivity table below shows the verdicts if the crowd halves, doubles or grows fivefold — the model is robust to the proxy being wrong by a factor of two, because the ranking is driven by the ratio, not the level.</p>' +
      '<div class="tablewrap"><table><thead><tr><th class="num">Crowd</th><th class="num">ROBUST</th><th class="num">FARM</th><th class="num">THIN</th><th class="num">SKIP</th></tr></thead><tbody>' + sens + '</tbody></table></div>' +
      '<h3>Accounting</h3><p>' + DATA.board_size + ' ranked + ' + DATA.set_aside_size + ' set aside + ' + DATA.trading_size +
      ' trading = ' + (DATA.board_size + DATA.set_aside_size + DATA.trading_size) + ' protocols in the snapshot. Watchlist ' +
      DATA.watchlist_size + '/' + DATA.watchlist_size + ' covered. ' + DATA.early_size + ' of the ranked rows are below the $' +
      fmtInt(DATA.floor_usd) + ' floor and are not on the watchlist.</p>' +
      '<h3>Assumptions</h3><p>Farmer share 10% of the launch value; T-bill 4% a year on the capital held; gas is 4 transactions ' +
      '($2, $4 or $8 each by chain cost); hold 10 days if the protocol is under 2 years old, 15 days if older, 30 days if it has no listing date. ' +
      'Verdicts at the $1,000 tier: ROBUST net ≥ $' + M.verdict_robust_net + ' and ≥ $' + M.verdict_robust_per_hour + '/h; FARM net ≥ $' + M.verdict_farm_net +
      '; THIN net &gt; $' + M.verdict_thin_net + '; SKIP below that. The walk-away is a value fall, not a TVL fall: in this model a TVL fall raises the farmer&rsquo;s capital-share faster than it cuts the fitted value, so the binding risk is the launch value coming in below the fit.</p>';
  })();

  // ---- set aside + live ----
  $('setaside').querySelector('tbody').innerHTML = DATA.set_aside.map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.category || '—') + '</td><td class="num">' + fmtUsd(s.tvl_usd) + '</td><td>' + esc(s.reason) + '</td></tr>';
  }).join('');
  $('live').querySelector('tbody').innerHTML = DATA.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td><td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- init ----
  readHash();
  $('q').value = state.q;
  $('verdict').value = state.verdict;
  $('sort').value = state.sort;
  setTab(state.tab);
  renderBoard();
  renderLab();
  if (state.detail) openDrawer(state.detail);
})();
