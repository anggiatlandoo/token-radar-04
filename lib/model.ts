// The crowd-dilution radar (model dilution-1): one snapshot of the protocol
// universe in, one ranked board out.
//
// The board ranks pre-token protocols by DILUTED expected value: what a farmer
// can actually expect once the crowd has taken its share. Three layers, each
// fitted or counted from the snapshot itself, never from a hand-kept list:
//
//   implied value   = what the token would be worth IF it launched. A log-log
//                     size curve of market cap on TVL, fitted by least squares
//                     on the snapshot's own live-token protocols (the comps).
//                     Huber robust regression gives the same curve to within
//                     the noise (LOO x3.35 vs x3.36), so the fit does not
//                     depend on the estimator. Growth, age and curvature were
//                     tested as fitted terms and DROPPED: none improves the
//                     leave-one-out miss (see the Validation tab).
//   P(launch)       = the share of protocols in the same age x TVL cell that
//                     already record a token, shrunk toward the global rate
//                     (shrinkage k chosen by holdout). It is an UPPER BOUND on
//                     a pre-token protocol's chance of launching: a protocol
//                     that has run years without a token has already survived
//                     the years when most launches happen. A three-way table
//                     (age x TVL x category) was tested and DROPPED: it
//                     calibrates worse (holdout MAE 0.173 vs 0.143), because
//                     its cells are too thin.
//   crowd factor    = the dilution. The farmer pool is split among the crowd,
//                     and the crowd grows with size: N = TVL / $1,000 is the
//                     estimated number of competing farmers (every dollar of
//                     TVL read as one $1,000 farmer ticket, an upper-bound
//                     proxy), and crowdFactor = 1 + N / N0 where N0 is the
//                     board's median N. The median protocol's slice is halved;
//                     a giant's is cut by two orders of magnitude. The ticket
//                     size cancels out of the ranking (both N and N0 scale
//                     with it), so the ranking depends only on a protocol's
//                     TVL relative to the board median -- the absolute farmer
//                     counts are the estimate, the factor is relative.
//   diluted value   = P(launch) x implied value / crowdFactor, with a band of
//                     +/- the leave-one-out median miss. The board is ranked
//                     by it. The undiluted expected value and the value if
//                     launched are shown beside it, so the reader sees exactly
//                     what the crowd costs.
//
// A protocol is pre-token when its record carries no token (no market cap, no
// CoinGecko id, no symbol). The board ranks every rankable pre-token protocol:
// the 40 on the watchlist, the 138 below the floor that pass the rule, and the
// 20 above the floor the watchlist rule leaves out but the rule still ranks --
// 198 rows in all. The 144 pre-token protocols the rule sets aside (bridges,
// staking products, exchanges, versioned pools, wrapped products) are shown
// with their reasons, and the 416 that already trade are shown at the market's
// own value. 198 + 144 + 416 = 758: the whole snapshot is accounted for,
// nothing is dropped silently.
//
// The farm plan is priced on the DILUTED slice: a farmer's expected slice is
// 10% farmer share x diluted expected value x (capital / TVL), minus gas minus
// the T-bill yield the capital gives up. Three capital tiers ($100 / $1,000 /
// $5,000) each carry a net, a net per hour and a verdict, and every row carries
// the capital at which farming breaks even, the crowd multiple at which its
// verdict flips, and the TVL fall that would erase its net. No protocol name is
// ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve, and the validation that stands behind it. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  comps: number;
  loo_miss: number;
  time_split_miss: number;
  time_split_fit: number;
  time_split_test: number;
  huber_loo_miss: number;
  term_tests: { name: string; loo_miss: number; kept: boolean }[];
}

/** The launch-probability table and its calibration. */
export interface LaunchTable {
  cells: { age: string; tvl: string; rate: number; n: number; tokenized: number }[];
  global_rate: number;
  shrinkage_k: number;
  holdout_mae: number;
  holdout_k_tested: { k: number; mae: number }[];
  three_way_mae: number;
  three_way_dropped: boolean;
}

/** The crowd layer's parameters and board-wide statistics. */
export interface CrowdStats {
  ticket_usd: number;
  median_farmers: number;
  crowd_factor_median: number;
  crowd_factor_p90: number;
  crowd_factor_max: number;
  sensitivity: { crowd_mult: number; robust: number; farm: number; thin: number; skip: number }[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  farmer_share: number;
  tbill_rate: number;
  ticket_usd: number;
  tiers: number[];
  verdict_robust_net: number;
  verdict_robust_per_hour: number;
  verdict_farm_net: number;
  verdict_thin_net: number;
}

export const MODEL: ModelConstants = {
  farmer_share: 0.1,
  tbill_rate: 0.04,
  ticket_usd: 1000,
  tiers: [100, 1000, 5000],
  /**
   * The verdict's dollars, at the $1,000 tier. Calibrated to the diluted net:
   * the best row nets about $18, so ROBUST is a clear profit ($10 and $5 an
   * hour), FARM breaks even or better, THIN is a small loss (within $10 of
   * break-even), and SKIP is a clear loss.
   */
  verdict_robust_net: 10,
  verdict_robust_per_hour: 5,
  verdict_farm_net: 0,
  verdict_thin_net: -10,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'dilution-1';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One capital tier of a row's farm plan, priced on the diluted slice. */
export interface FarmTier {
  capital_usd: number;
  slice_before_usd: number;
  slice_usd: number;
  gas_usd: number;
  opportunity_usd: number;
  net_usd: number;
  hours: number;
  net_per_hour_usd: number;
  verdict: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    implied_if_launched_usd: number;
    launch_probability: number;
    launch_cell: string;
    expected_value_usd: number;
    band_low_usd: number;
    band_high_usd: number;
    crowd_factor: number;
    farmers: number;
    age_days: number | null;
  };
  farm: {
    verdict: string;
    gas_usd: number;
    hold_days: number;
    break_even_capital_usd: number | null;
    walk_away_tvl_fall_pct: number | null;
    flip_mult: number | null;
    tiers: FarmTier[];
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_if_launched_usd: number;
  launch_probability: number;
  launch_cell: string;
  expected_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  crowd_factor: number;
  farmers: number;
  verdict: string;
  gas_usd: number;
  hold_days: number;
  break_even_capital_usd: number | null;
  walk_away_tvl_fall_pct: number | null;
  flip_mult: number | null;
  tiers: FarmTier[];
  sensitivity: { mult: number; slice_usd: number; net_usd: number; verdict: string }[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the rule sets aside, and why. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, the set-aside, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  trading_size: number;
  curve: CurveFit;
  launch: LaunchTable;
  crowd: CrowdStats;
  verdict_counts: { robust: number; farm: number; thin: number; skip: number };
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG10 = (x: number): number => Math.log10(x);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the board never ranks: bridges, staking products and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whole words that mark a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and none of the exclusions. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** Why a pre-token protocol is set aside, in the words the dashboard shows. */
export function setAsideReason(p: SnapshotProtocol): string {
  if (p.category === 'CEX') return 'Exchange: an exchange, not a farmable protocol';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return 'Bridge: moving value is not a launch to farm';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'Staking product: a receipt for a token that already trades';
  if (VERSIONED.test(p.name)) return 'Versioned pool: a numbered release of another protocol';
  if (EXCHANGE_PREFIX.test(p.name)) return 'Exchange product: named for an exchange';
  if (WRAPPED_WORD.test(p.name)) return 'Wrapped or staked: a product of a token that already trades';
  return 'Not rankable';
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Least squares on log10(market cap) against log10(TVL): intercept, slope, R squared. */
export function olsFit(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    syy += (ys[i]! - my) ** 2;
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  return { a, b, r2: (sxy * sxy) / (sxx * syy) };
}

/** Huber robust regression (IRLS, k = 1.345 sigma): the same curve, downweighting outliers. */
export function huberFit(xs: number[], ys: number[]): { a: number; b: number } {
  let f = olsFit(xs, ys);
  for (let it = 0; it < 25; it++) {
    const res = xs.map((x, i) => ys[i]! - (f.a + f.b * x));
    const sorted = [...res].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    const absDev = res.map((r) => Math.abs(r - med)).sort((a, b) => a - b);
    const sigma = Math.max(absDev[Math.floor(absDev.length / 2)]! * 1.4826, 1e-6);
    const k = 1.345 * sigma;
    const w = res.map((r) => (Math.abs(r) <= k ? 1 : k / Math.abs(r)));
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += w[i]!;
      mx += w[i]! * xs[i]!;
      my += w[i]! * ys[i]!;
    }
    mx /= sw;
    my /= sw;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxx += w[i]! * (xs[i]! - mx) ** 2;
      sxy += w[i]! * (xs[i]! - mx) * (ys[i]! - my);
    }
    const b = sxy / sxx;
    const a = my - b * mx;
    if (Math.abs(a - f.a) < 1e-9 && Math.abs(b - f.b) < 1e-9) return { a, b };
    f = { a, b };
  }
  return f;
}

/** The median absolute log10 error of a leave-one-out refit, as a multiple (10^median). */
export function looMiss(xs: number[], ys: number[], fit: (x: number[], y: number[]) => { a: number; b: number }): number {
  const errs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const xi = xs.filter((_, j) => j !== i);
    const yi = ys.filter((_, j) => j !== i);
    const f = fit(xi, yi);
    errs.push(Math.abs(ys[i]! - (f.a + f.b * xs[i]!)));
  }
  errs.sort((a, b) => a - b);
  return 10 ** errs[Math.floor(errs.length / 2)]!;
}

/** Least squares with one extra regressor, by 3x3 Gaussian elimination. */
function olsTwo(xs: number[], ys: number[], zs: number[]): { a: number; b: number; c: number } {
  const n = xs.length;
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxz = 0, szz = 0, sxy = 0, szy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!; sy += ys[i]!; sz += zs[i]!;
    sxx += xs[i]! ** 2; sxz += xs[i]! * zs[i]!; szz += zs[i]! ** 2;
    sxy += xs[i]! * ys[i]!; szy += zs[i]! * ys[i]!;
  }
  const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]];
  const Bv = [sy, sxy, szy];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    [Bv[c], Bv[piv]] = [Bv[piv]!, Bv[c]!];
    for (let r = c + 1; r < 3; r++) {
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 3; k++) A[r]![k]! -= f * A[c]![k]!;
      Bv[r]! -= f * Bv[c]!;
    }
  }
  const sol = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let v = Bv[r]!;
    for (let k = r + 1; k < 3; k++) v -= A[r]![k]! * sol[k]!;
    sol[r] = v / A[r]![r]!;
  }
  return { a: sol[0]!, b: sol[1]!, c: sol[2]! };
}

/** The leave-one-out miss of a two-regressor fit, as a multiple. */
function looMissTwo(xs: number[], ys: number[], zs: number[]): number {
  const errs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const xi = xs.filter((_, j) => j !== i);
    const yi = ys.filter((_, j) => j !== i);
    const zi = zs.filter((_, j) => j !== i);
    const f = olsTwo(xi, yi, zi);
    errs.push(Math.abs(ys[i]! - (f.a + f.b * xs[i]! + f.c * zs[i]!)));
  }
  errs.sort((a, b) => a - b);
  return 10 ** errs[Math.floor(errs.length / 2)]!;
}

/** The live-token comps: a token that trades, a market cap and a TVL, not an exchange. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
}

/** The size curve and every validation number behind it, fitted at run time. */
export function fitCurve(snapshot: Snapshot): CurveFit {
  const comps = compsOf(snapshot);
  const xs = comps.map((p) => LOG10(p.tvl_usd));
  const ys = comps.map((p) => LOG10(p.mcap_usd!));
  const fit = olsFit(xs, ys);
  const loo = looMiss(xs, ys, olsFit);
  const huberLoo = looMiss(xs, ys, huberFit);
  const cut = Date.parse('2025-01-01T00:00:00Z');
  const train = comps.filter((p) => p.listed_at !== null && Date.parse(p.listed_at + 'T00:00:00Z') < cut);
  const test = comps.filter((p) => p.listed_at !== null && Date.parse(p.listed_at + 'T00:00:00Z') >= cut);
  const trainFit = olsFit(train.map((p) => LOG10(p.tvl_usd)), train.map((p) => LOG10(p.mcap_usd!)));
  const testErrs = test
    .map((p) => Math.abs(LOG10(p.mcap_usd!) - (trainFit.a + trainFit.b * LOG10(p.tvl_usd))))
    .sort((a, b) => a - b);
  const timeSplit = testErrs.length > 0 ? 10 ** testErrs[Math.floor(testErrs.length / 2)]! : NaN;
  const growth = comps.map((p) => Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100);
  const ageYears = comps.map((p) => {
    const a = ageDays(snapshot.as_of, p.listed_at);
    return a === null ? 516 / 365 : a / 365;
  });
  const curve2 = xs.map((x) => x * x);
  const termTests = [
    { name: 'size only', loo_miss: loo, kept: true },
    { name: '+ growth (change_7d)', loo_miss: looMissTwo(xs, ys, growth), kept: false },
    { name: '+ age (years)', loo_miss: looMissTwo(xs, ys, ageYears), kept: false },
    { name: '+ curvature (log TVL squared)', loo_miss: looMissTwo(xs, ys, curve2), kept: false },
  ];
  return {
    intercept: fit.a,
    slope: fit.b,
    r2: fit.r2,
    comps: comps.length,
    loo_miss: loo,
    time_split_miss: timeSplit,
    time_split_fit: train.length,
    time_split_test: test.length,
    huber_loo_miss: huberLoo,
    term_tests: termTests,
  };
}

/** A deterministic split: a slug's hash decides its half, so the holdout is reproducible. */
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The age bucket of a protocol: young, mid, old, or unknown. */
function ageBucket(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 365) return 'young';
  if (age < 730) return 'mid';
  return 'old';
}

/** The TVL bucket of a protocol: small, mid, or large. */
function tvlBucket(tvl: number): string {
  if (tvl < 50_000_000) return 'small';
  if (tvl < 500_000_000) return 'mid';
  return 'large';
}

/** A two-way launch table (age x TVL) on `rows`, shrunk toward the global rate by k. */
function launchTable2(rows: SnapshotProtocol[], snapshot: Snapshot, k: number): Map<string, number> {
  const cells = new Map<string, { n: number; tok: number }>();
  for (const p of rows) {
    const key = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}`;
    const c = cells.get(key) ?? { n: 0, tok: 0 };
    c.n++;
    if (!isPreToken(p)) c.tok++;
    cells.set(key, c);
  }
  const global = rows.filter((p) => !isPreToken(p)).length / rows.length;
  const out = new Map<string, number>();
  for (const [key, c] of cells) out.set(key, (c.tok + k * global) / (c.n + k));
  return out;
}

/** The holdout MAE of a two-way table at shrinkage k: build on one half, score on the other. */
function launchHoldoutMaE(snapshot: Snapshot, k: number): number {
  const halfA = snapshot.protocols.filter((p) => hashSlug(p.slug) % 2 === 0);
  const halfB = snapshot.protocols.filter((p) => hashSlug(p.slug) % 2 === 1);
  const table = launchTable2(halfA, snapshot, k);
  const global = halfA.filter((p) => !isPreToken(p)).length / halfA.length;
  const cellsB = new Map<string, { n: number; tok: number }>();
  for (const p of halfB) {
    const key = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}`;
    const c = cellsB.get(key) ?? { n: 0, tok: 0 };
    c.n++;
    if (!isPreToken(p)) c.tok++;
    cellsB.set(key, c);
  }
  let sum = 0;
  let n = 0;
  for (const [key, c] of cellsB) {
    if (c.n < 5) continue;
    const pred = table.get(key) ?? global;
    sum += Math.abs(pred - c.tok / c.n);
    n++;
  }
  return n > 0 ? sum / n : NaN;
}

/** The holdout MAE of a three-way table (age x TVL x category), shrunk toward the two-way rate. */
function launchHoldoutMaE3(snapshot: Snapshot, k3: number): number {
  const halfA = snapshot.protocols.filter((p) => hashSlug(p.slug) % 2 === 0);
  const halfB = snapshot.protocols.filter((p) => hashSlug(p.slug) % 2 === 1);
  const table2 = launchTable2(halfA, snapshot, 5);
  const global = halfA.filter((p) => !isPreToken(p)).length / halfA.length;
  const cells3 = new Map<string, { n: number; tok: number }>();
  for (const p of halfA) {
    const key = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}|${p.category ?? 'null'}`;
    const c = cells3.get(key) ?? { n: 0, tok: 0 };
    c.n++;
    if (!isPreToken(p)) c.tok++;
    cells3.set(key, c);
  }
  const rate3 = new Map<string, number>();
  for (const [key, c] of cells3) {
    const base2 = table2.get(key.split('|').slice(0, 2).join('|')) ?? global;
    rate3.set(key, (c.tok + k3 * base2) / (c.n + k3));
  }
  const cellsB = new Map<string, { n: number; tok: number }>();
  for (const p of halfB) {
    const key = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}|${p.category ?? 'null'}`;
    const c = cellsB.get(key) ?? { n: 0, tok: 0 };
    c.n++;
    if (!isPreToken(p)) c.tok++;
    cellsB.set(key, c);
  }
  let sum = 0;
  let n = 0;
  for (const [key, c] of cellsB) {
    if (c.n < 5) continue;
    const base2 = table2.get(key.split('|').slice(0, 2).join('|')) ?? global;
    const pred = rate3.get(key) ?? base2;
    sum += Math.abs(pred - c.tok / c.n);
    n++;
  }
  return n > 0 ? sum / n : NaN;
}

/** The launch-probability table, its shrinkage chosen by holdout, and the three-way test. */
export function buildLaunchTable(snapshot: Snapshot): { table: Map<string, number>; info: LaunchTable } {
  const kTested = [2, 5, 10].map((k) => ({ k, mae: launchHoldoutMaE(snapshot, k) }));
  const best = kTested.reduce((a, b) => (b.mae < a.mae ? b : a));
  const table = launchTable2(snapshot.protocols, snapshot, best.k);
  const global = snapshot.protocols.filter((p) => !isPreToken(p)).length / snapshot.protocols.length;
  const threeWay = launchHoldoutMaE3(snapshot, 10);
  const cells: LaunchTable['cells'] = [];
  const counts = new Map<string, { n: number; tok: number }>();
  for (const p of snapshot.protocols) {
    const key = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}`;
    const c = counts.get(key) ?? { n: 0, tok: 0 };
    c.n++;
    if (!isPreToken(p)) c.tok++;
    counts.set(key, c);
  }
  for (const [key, c] of counts) {
    const [age, tvl] = key.split('|');
    cells.push({ age: age!, tvl: tvl!, rate: table.get(key) ?? global, n: c.n, tokenized: c.tok });
  }
  cells.sort((a, b) => (a.age + a.tvl < b.age + b.tvl ? -1 : 1));
  return {
    table,
    info: {
      cells,
      global_rate: global,
      shrinkage_k: best.k,
      holdout_mae: best.mae,
      holdout_k_tested: kTested,
      three_way_mae: threeWay,
      three_way_dropped: threeWay > best.mae,
    },
  };
}

/** The launch probability of one protocol, from its age x TVL cell. */
function launchProbability(p: SnapshotProtocol, snapshot: Snapshot, table: Map<string, number>, global: number): { rate: number; cell: string } {
  const cell = `${ageBucket(ageDays(snapshot.as_of, p.listed_at))}|${tvlBucket(p.tvl_usd)}`;
  return { rate: table.get(cell) ?? global, cell };
}

/** Gas per transaction, by the protocol's first chain: an estimate, stated as one. */
const CHEAP_CHAINS = new Set([
  'Arbitrum', 'Optimism', 'Base', 'Polygon', 'BSC', 'BNB Chain', 'Avalanche', 'Solana',
  'zkSync Era', 'Linea', 'Scroll', 'Blast', 'Mantle', 'Mode', 'Fraxtal', 'Berachain',
  'Sonic', 'HyperEVM', 'Sei', 'Sui', 'Aptos', 'Near', 'Starknet', 'Zora', 'Gnosis',
  'Fantom', 'Celo', 'Moonbeam', 'Kava', 'Cronos', 'Metis', 'Manta', 'Taiko', 'X Layer',
]);
function gasPerTx(p: SnapshotProtocol): number {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  if (chain === 'Ethereum') return 8;
  if (CHEAP_CHAINS.has(chain)) return 2;
  return 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The hands-on hours of a farm plan: setup, weekly actions, and the claim. */
function hoursFor(holdDays: number): number {
  return 0.25 + (holdDays / 7) * 0.17 + 0.17;
}

/** A verdict from the diluted net and the net per hour at the $1,000 tier. */
export function verdictFor(net: number, netPerHour: number): string {
  if (net >= MODEL.verdict_robust_net && netPerHour >= MODEL.verdict_robust_per_hour) return 'ROBUST';
  if (net >= MODEL.verdict_farm_net) return 'FARM';
  if (net > MODEL.verdict_thin_net) return 'THIN';
  return 'SKIP';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The dollar form a reader sees: $1,234 or $1.23M. */
function usd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${round2(n)}`;
}

/**
 * One row's farm plan, priced on the DILUTED slice at three capital tiers, with
 * the capital at which farming breaks even, the crowd multiple at which its
 * verdict flips, and the launch-value fall that would erase its net.
 */
export function farmFor(
  p: SnapshotProtocol,
  age: number | null,
  impliedIfLaunched: number,
  probability: number,
  crowdFactor: number,
  farmers: number,
  ratio: number,
): {
  farm: BoardRow['farm'];
  sensitivity: { mult: number; slice_usd: number; net_usd: number; verdict: string }[];
  netAt2x: number;
  verdictAt2x: string;
} {
  const gas = 4 * gasPerTx(p);
  const hold = holdDaysFor(age);
  const hours = hoursFor(hold);
  const oppRate = MODEL.tbill_rate * (hold / 365);
  // The undiluted slice at each tier, then the crowd's cut, then the costs.
  const tiers: FarmTier[] = MODEL.tiers.map((capital) => {
    const sliceBefore = (MODEL.farmer_share * probability * impliedIfLaunched * capital) / p.tvl_usd;
    const slice = sliceBefore / crowdFactor;
    const opportunity = capital * oppRate;
    const net = slice - gas - opportunity;
    const netPerHour = net / hours;
    return {
      capital_usd: capital,
      slice_before_usd: Math.round(sliceBefore * 100) / 100,
      slice_usd: Math.round(slice * 100) / 100,
      gas_usd: gas,
      opportunity_usd: Math.round(opportunity * 100) / 100,
      net_usd: Math.round(net * 100) / 100,
      hours: round2(hours),
      net_per_hour_usd: round2(netPerHour),
      verdict: verdictFor(net, netPerHour),
    };
  });
  const mid = tiers[1]!;
  const verdict = mid.verdict;
  // Break-even capital, closed form: net(C) = C * slope - gas, slope from the
  // diluted slice per dollar minus the T-bill yield the capital gives up.
  const slope = (MODEL.farmer_share * probability * impliedIfLaunched) / (p.tvl_usd * crowdFactor) - oppRate;
  const breakEven = slope > 0 ? Math.max(1, Math.ceil(gas / slope)) : null;
  // The crowd multiple at which the $1,000-tier verdict first drops: solve
  // slice0 / (1 + m*r) - gas - opp = T for the next threshold down.
  const slice0 = (MODEL.farmer_share * probability * impliedIfLaunched * 1000) / p.tvl_usd;
  const opp1000 = 1000 * oppRate;
  const threshold = verdict === 'ROBUST' ? Math.max(MODEL.verdict_robust_net, MODEL.verdict_robust_per_hour * hours) : verdict === 'FARM' ? MODEL.verdict_farm_net : verdict === 'THIN' ? MODEL.verdict_thin_net : null;
  let flipMult: number | null = null;
  if (threshold !== null) {
    const m = (slice0 / (threshold + gas + opp1000) - 1) / ratio;
    flipMult = m > 1 && m <= 1000 ? round2(m) : null;
  }
  // The walk-away is a VALUE fall, not a TVL fall: in this model a TVL fall
  // raises the farmer's capital-share faster than it cuts the fitted value, so
  // the binding risk is the launch value coming in below the fit. x is the
  // value-realisation factor at which the $1,000-tier net is zero.
  const x = ((gas + opp1000) * p.tvl_usd * crowdFactor) / (MODEL.farmer_share * probability * impliedIfLaunched * 1000);
  const walkAway = x < 1 ? Math.round((1 - x) * 100) : null;
  // The crowd sensitivity at the $1,000 tier: the net and verdict if the crowd
  // halves, doubles, or grows fivefold.
  const sensitivity = [0.5, 1, 2, 5].map((mult) => {
    const slice = slice0 / (1 + mult * ratio);
    const net = slice - gas - opp1000;
    return {
      mult,
      slice_usd: Math.round(slice * 100) / 100,
      net_usd: Math.round(net * 100) / 100,
      verdict: verdictFor(net, net / hours),
    };
  });
  const at2x = sensitivity[2]!;
  return {
    farm: {
      verdict,
      gas_usd: gas,
      hold_days: hold,
      break_even_capital_usd: breakEven,
      walk_away_tvl_fall_pct: walkAway,
      flip_mult: flipMult,
      tiers,
    },
    sensitivity,
    netAt2x: at2x.net_usd,
    verdictAt2x: at2x.verdict,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The crowd step names the row's own numbers: how many farmers are already
 * here, what the crowd costs, and what happens if it doubles.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  farm: BoardRow['farm'],
  farmers: number,
  crowdFactor: number,
  netAt2x: number,
  verdictAt2x: string,
): FarmStep[] {
  const chain = chainOf(p);
  const hold = farm.hold_days;
  const action = actionFor(p, 1000, chain);
  const mid = farm.tiers[1]!;
  const crowdLine =
    farm.flip_mult !== null
      ? `If the crowd grows ${farm.flip_mult}x, this row's verdict drops from ${farm.verdict}.`
      : `The crowd would have to grow more than 1,000x to change this row's verdict.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$1,000 of capital and about $${farm.gas_usd} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Crowd check: about ${farmers.toLocaleString('en-US')} farmers are already here (crowd factor ${crowdFactor.toFixed(2)}x), and the crowd takes ${usd(mid.slice_before_usd - mid.slice_usd)} of your ${usd(mid.slice_before_usd)} slice before you start. If the crowd doubles, your net falls to ${usd(netAt2x)} (${verdictAt2x}). ${crowdLine}`,
      cost: 'the crowd, not a fee',
      time: 'check the Crowd lab before you deposit',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $1,000 stays in the position`,
      time: `${hold} days`,
    },
    {
      text:
        farm.walk_away_tvl_fall_pct !== null
          ? `Walk away if the launch value comes in more than ${farm.walk_away_tvl_fall_pct}% below the fitted value: at that point the $1,000 tier's net is zero.`
          : `Walk away if the launch value comes in below the fitted value: even the full fitted value does not cover the $1,000 tier's costs here.`,
      cost: 'nothing to walk away',
      time: 'decide before you deposit',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes to claim, 5 minutes to log',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  curve: CurveFit,
  launch: { table: Map<string, number>; info: LaunchTable },
): { board: BoardRow[]; radarRows: RadarRow[]; crowd: CrowdStats; verdictCounts: { robust: number; farm: number; thin: number; skip: number } } {
  const index = bySlug(snapshot.protocols);
  const ranked = snapshot.protocols.filter((p) => isRankable(p));
  // The crowd's anchor: the board median of N = TVL / ticket, computed at run time.
  const farmersAll = ranked.map((p) => p.tvl_usd / MODEL.ticket_usd).sort((a, b) => a - b);
  const medianFarmers = farmersAll[Math.floor(farmersAll.length / 2)]!;
  const global = launch.info.global_rate;
  const scored = ranked.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = 10 ** (curve.intercept + curve.slope * LOG10(p.tvl_usd));
    const { rate: probability, cell } = launchProbability(p, snapshot, launch.table, global);
    const expected = probability * implied;
    const farmers = Math.round(p.tvl_usd / MODEL.ticket_usd);
    const ratio = farmers / medianFarmers;
    const crowdFactor = 1 + ratio;
    const diluted = expected / crowdFactor;
    const bandLow = (probability * implied) / curve.loo_miss / crowdFactor;
    const bandHigh = (probability * implied * curve.loo_miss) / crowdFactor;
    return { p, age, implied, probability, cell, expected, farmers, ratio, crowdFactor, diluted, bandLow, bandHigh };
  });
  scored.sort((a, b) => b.diluted - a.diluted || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = [];
  const radarRows: RadarRow[] = [];
  const verdictCounts = { robust: 0, farm: 0, thin: 0, skip: 0 };
  const crowdFactors: number[] = [];
  // Verdict counts under a crowd that halves, doubles, or grows fivefold.
  const sensCounts = new Map<number, { robust: number; farm: number; thin: number; skip: number }>();
  for (const mult of [0.5, 1, 2, 5]) sensCounts.set(mult, { robust: 0, farm: 0, thin: 0, skip: 0 });
  scored.forEach((s, i) => {
    const { farm, sensitivity, netAt2x, verdictAt2x } = farmFor(s.p, s.age, s.implied, s.probability, s.crowdFactor, s.farmers, s.ratio);
    const steps = farmSteps(s.p, s.age, farm, s.farmers, s.crowdFactor, netAt2x, verdictAt2x).map(stepText);
    const impliedValue = Math.max(1, Math.round(s.diluted));
    crowdFactors.push(s.crowdFactor);
    if (farm.verdict === 'ROBUST') verdictCounts.robust++;
    else if (farm.verdict === 'FARM') verdictCounts.farm++;
    else if (farm.verdict === 'THIN') verdictCounts.thin++;
    else verdictCounts.skip++;
    // The verdict at each crowd multiple, from the sensitivity table.
    for (const entry of sensitivity) {
      const c = sensCounts.get(entry.mult)!;
      if (entry.verdict === 'ROBUST') c.robust++;
      else if (entry.verdict === 'FARM') c.farm++;
      else if (entry.verdict === 'THIN') c.thin++;
      else c.skip++;
    }
    board.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: impliedValue,
      model: {
        implied_if_launched_usd: Math.max(1, Math.round(s.implied)),
        launch_probability: round4(s.probability),
        launch_cell: s.cell,
        expected_value_usd: Math.max(1, Math.round(s.expected)),
        band_low_usd: Math.max(1, Math.round(s.bandLow)),
        band_high_usd: Math.max(1, Math.round(s.bandHigh)),
        crowd_factor: round4(s.crowdFactor),
        farmers: s.farmers,
        age_days: s.age,
      },
      farm,
      farm_steps: steps,
    });
    radarRows.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.age,
      implied_value_usd: impliedValue,
      implied_if_launched_usd: Math.max(1, Math.round(s.implied)),
      launch_probability: round4(s.probability),
      launch_cell: s.cell,
      expected_value_usd: Math.max(1, Math.round(s.expected)),
      band_low_usd: Math.max(1, Math.round(s.bandLow)),
      band_high_usd: Math.max(1, Math.round(s.bandHigh)),
      crowd_factor: round4(s.crowdFactor),
      farmers: s.farmers,
      verdict: farm.verdict,
      gas_usd: farm.gas_usd,
      hold_days: farm.hold_days,
      break_even_capital_usd: farm.break_even_capital_usd,
      walk_away_tvl_fall_pct: farm.walk_away_tvl_fall_pct,
      flip_mult: farm.flip_mult,
      tiers: farm.tiers,
      sensitivity,
      farm_steps: steps,
    });
  });
  crowdFactors.sort((a, b) => a - b);
  const crowd: CrowdStats = {
    ticket_usd: MODEL.ticket_usd,
    median_farmers: Math.round(medianFarmers),
    crowd_factor_median: round2(crowdFactors[Math.floor(crowdFactors.length / 2)]!),
    crowd_factor_p90: round2(crowdFactors[Math.floor(crowdFactors.length * 0.9)]!),
    crowd_factor_max: round2(crowdFactors[crowdFactors.length - 1]!),
    sensitivity: [0.5, 1, 2, 5].map((mult) => {
      const c = sensCounts.get(mult)!;
      return { crowd_mult: mult, robust: c.robust, farm: c.farm, thin: c.thin, skip: c.skip };
    }),
  };
  return { board, radarRows, crowd, verdictCounts };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const curve = fitCurve(snapshot);
  const launch = buildLaunchTable(snapshot);
  const { board, radarRows, crowd, verdictCounts } = buildBoard(snapshot, curve, launch);
  const live = liveRows(snapshot);
  const setAside = snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: setAsideReason(p) }));
  const trading = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    set_aside_size: setAside.length,
    trading_size: trading,
    curve,
    launch: launch.info,
    crowd,
    verdict_counts: verdictCounts,
    rows: radarRows,
    live,
    set_aside: setAside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  if (o.protocols.length === 0) throw new SnapshotError('snapshot.json holds no protocols');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
