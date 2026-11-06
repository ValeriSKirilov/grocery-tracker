/* ==========================================================================
   core.js — състояние, слой за данни (live API + демо) и аналитика.
   Няма DOM код. Излага всичко през window.SB.
   ========================================================================== */
(() => {
  "use strict";

  const DEMO = window.SmartBasketDemo;
  const API = String(
    window.SMARTBASKET_API_BASE || "http://localhost:8000/api/v1",
  ).replace(/\/$/, "");
  const REQUEST_TIMEOUT = 6000;
  const STORAGE_KEY = "smartbasket_state_v2";
  const LEGACY_KEY = "smartbasket_state_v1";
  const DAY = 86400000;

  /* ───────────────────────── helpers ───────────────────────── */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const norm = (s) => String(s == null ? "" : s).toLowerCase();
  const ts = (d) => Date.parse(d + "T00:00:00Z");
  const fmtNum = new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const eur = (n) => `${fmtNum.format(Number(n) || 0)} €`;
  const signedEur = (n) =>
    `${n > 0.004 ? "+" : n < -0.004 ? "−" : ""}${fmtNum.format(Math.abs(Number(n) || 0))} €`;
  const fmtPct = (v, digits = 1) => {
    const x = (Number(v) || 0) * 100;
    const sign = x > 0.049 ? "+" : x < -0.049 ? "−" : "";
    return `${sign}${Math.abs(x).toFixed(digits).replace(".", ",")}%`;
  };
  const pct0 = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
  const plural = (n, one, many) => (n === 1 ? one : many);

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (i < items.length) {
          const idx = i++;
          try {
            out[idx] = await fn(items[idx], idx);
          } catch (_) {
            out[idx] = null;
          }
        }
      },
    );
    await Promise.all(workers);
    return out;
  }

  /* ───────────────────────── persistent state ───────────────────────── */
  const DEFAULTS = {
    ekatte_code: "68134",
    include_promos: true,
    items: [
      { category_id: 12, qty: 2 },
      { category_id: 20, qty: 1 },
      { category_id: 1, qty: 1 },
      { category_id: 18, qty: 1 },
    ],
    budget: null,
    excluded_chains: [],
    max_stores: 2,
    tab: "compare",
    checked: {},
    saved: [],
  };

  function cleanItems(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    arr.forEach((i) => {
      const id = Number(i && i.category_id);
      const qty = Math.round(Number(i && i.qty));
      if (!Number.isFinite(id) || !(qty > 0) || seen.has(id)) return;
      seen.add(id);
      out.push({ category_id: id, qty: clamp(qty, 1, 99) });
    });
    return out;
  }

  function loadState() {
    let saved = null;
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (_) {
      saved = null;
    }
    const st = Object.assign(
      clone(DEFAULTS),
      saved && typeof saved === "object" ? saved : {},
    );
    st.ekatte_code = String(st.ekatte_code || DEFAULTS.ekatte_code);
    st.include_promos = st.include_promos !== false;
    st.items =
      saved && Array.isArray(saved.items)
        ? cleanItems(saved.items)
        : clone(DEFAULTS.items);
    st.budget = Number(st.budget) > 0 ? Number(st.budget) : null;
    st.excluded_chains = Array.isArray(st.excluded_chains)
      ? st.excluded_chains.map(String)
      : [];
    st.max_stores = clamp(Math.round(Number(st.max_stores) || 2), 1, 3);
    st.tab = ["compare", "catalog", "plan", "deals", "history"].includes(st.tab)
      ? st.tab
      : "compare";
    st.checked = st.checked && typeof st.checked === "object" ? st.checked : {};
    st.saved = Array.isArray(st.saved) ? st.saved.slice(0, 20) : [];
    return st;
  }

  const state = loadState();
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* private mode / quota */
    }
  }

  /* ───────────────────────── runtime (не се пази) ───────────────────────── */
  const rt = {
    mode: "demo", // "live" | "demo"
    offline: false, // true ако сме паднали към демо след опит за live
    meta: { settlements: [], categories: [], chains: [] },
    catById: new Map(),
    knownCats: new Map(),
    settlementByCode: new Map(),

    result: null,
    view: null,
    loading: false,
    error: null,
    diagnosis: null,
    trend: null,
    reqSeq: 0,
    trendToken: 0,
    histToken: 0,
    prevBest: null,

    histories: new Map(),

    rankView: "rank",
    openChains: new Set(),
    openTouched: false,

    deals: {
      all: [],
      loaded: false,
      loading: false,
      error: false,
      shown: 12,
      query: "",
      sort: "pct",
      chain: "all",
      onlyBasket: false,
      verified: new Map(),
    },
    history: {
      category: null,
      chain: null,
      range: 30,
      view: "single",
      focus: null,
    },
  };

  const hooks = { offline: null };

  /* ───────────────────────── нормализация ───────────────────────── */
  function normMeta(raw) {
    const pad = (c) =>
      typeof c === "number"
        ? String(c).padStart(5, "0")
        : String(c == null ? "" : c).trim();
    const settlements = ((raw && raw.settlements) || [])
      .map((s) => {
        const code = pad(
          s.ekatte_code != null
            ? s.ekatte_code
            : s.ekatte != null
              ? s.ekatte
              : s.code != null
                ? s.code
                : s.id,
        );
        const name =
          s.name || s.name_bg || s.settlement_name || s.title || code;
        return { code, name: String(name) };
      })
      .filter((s) => s.code);
    const categories = ((raw && raw.categories) || [])
      .map((c) => {
        const id = Number(c.id != null ? c.id : c.category_id);
        const name = c.name || c.name_bg || c.title || `Категория #${id}`;
        const group =
          c.group ||
          c.group_name ||
          c.category_group ||
          c.parent_name ||
          "Други";
        return {
          id,
          name: String(name),
          short: c.short || null,
          group: String(group),
        };
      })
      .filter((c) => Number.isFinite(c.id));
    const chains = ((raw && raw.chains) || [])
      .map((c) => (typeof c === "string" ? c : c && (c.chain_name || c.name)))
      .filter(Boolean);
    return { settlements, categories, chains };
  }

  function demoMeta() {
    return {
      settlements: DEMO.settlements.map((s) => ({
        code: s.code,
        name: s.name,
      })),
      categories: DEMO.categories.map((c) => ({
        id: c.id,
        name: c.name,
        short: c.short,
        group: c.group,
      })),
      chains: DEMO.chains.slice(),
    };
  }

  function applyMeta(meta) {
    rt.meta = meta;
    rt.catById = new Map(meta.categories.map((c) => [c.id, c]));
    meta.categories.forEach((c) => rt.knownCats.set(c.id, c));
    rt.settlementByCode = new Map(meta.settlements.map((s) => [s.code, s]));
  }

  function normResult(raw) {
    const rankings = ((raw && raw.rankings) || [])
      .map((r) => ({
        chain_name: String(r.chain_name),
        total_cost: Number(r.total_cost) || 0,
        total_promo_savings: Number(r.total_promo_savings) || 0,
        matched_items: (r.matched_items || []).map((it) => ({
          category_id: Number(it.category_id),
          product_id: it.product_id,
          product_name: String(it.product_name || ""),
          qty: Number(it.qty) || 1,
          unit_regular_price: Number(it.unit_regular_price) || 0,
          unit_promo_price:
            it.unit_promo_price == null ? null : Number(it.unit_promo_price),
          line_total: Number(it.line_total) || 0,
        })),
      }))
      .sort((a, b) => a.total_cost - b.total_cost);
    return { ekatte_code: raw && raw.ekatte_code, rankings };
  }

  function normProduct(p) {
    const reg = Number(p.regular_price) || 0;
    const promo = p.promo_price == null ? null : Number(p.promo_price);
    return {
      product_id: p.product_id,
      name: String(p.name || ""),
      chain_name: String(p.chain_name || ""),
      category_id: Number(p.category_id),
      regular_price: reg,
      promo_price: promo,
      effective_price:
        p.effective_price != null
          ? Number(p.effective_price)
          : promo != null
            ? promo
            : reg,
      date: p.date,
    };
  }

  function normHistory(h) {
    if (!h || !Array.isArray(h.dates) || !h.dates.length) return null;
    const n = h.dates.length;
    const reg = (h.regular_prices || []).map(Number);
    const pro = (h.promo_prices || []).map((v) =>
      v == null ? null : Number(v),
    );
    while (pro.length < n) pro.push(null);
    return {
      product_id: h.product_id,
      product_name: String(h.product_name || ""),
      chain_name: String(h.chain_name || ""),
      dates: h.dates.map(String),
      regular_prices: reg.slice(0, n),
      promo_prices: pro.slice(0, n),
      fake_discount_warning:
        typeof h.fake_discount_warning === "boolean"
          ? h.fake_discount_warning
          : DEMO.detectFake(h.dates, reg, pro),
    };
  }

  /* ───────────────────────── HTTP + слой за данни ───────────────────────── */
  async function http(path, opts = {}) {
    const { method = "GET", body, timeout = REQUEST_TIMEOUT } = opts;
    const ctrl =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await fetch(API + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) {
        let detail = "";
        try {
          const j = await res.json();
          detail = typeof j.detail === "string" ? j.detail : "";
        } catch (_) {
          /* ignore */
        }
        const err = new Error(detail || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const isOutage = (e) => !e || e.status == null || e.status >= 500;

  function buildPayload() {
    return {
      ekatte_code: state.ekatte_code,
      include_promos: state.include_promos,
      items: state.items.map((i) => ({
        category_id: i.category_id,
        qty: i.qty,
      })),
    };
  }

  function sanitizeState(opts = {}) {
    let changed = false;
    if (opts.items) {
      const before = state.items.length;
      state.items = state.items.filter((i) => rt.catById.has(i.category_id));
      if (state.items.length !== before) changed = true;
    }
    if (!rt.settlementByCode.has(state.ekatte_code)) {
      const first = rt.settlementByCode.has("68134")
        ? "68134"
        : rt.meta.settlements[0] && rt.meta.settlements[0].code;
      if (first) {
        state.ekatte_code = first;
        changed = true;
      }
    }
    if (changed) saveState();
    return changed;
  }

  function useDemo(offline) {
    rt.mode = "demo";
    rt.offline = !!offline;
    applyMeta(demoMeta());
    rt.histories.clear();
  }

  function goOffline(err) {
    if (rt.mode === "demo") return;
    console.warn(
      "[SmartBasket] API недостъпно — превключване към демо данни:",
      err,
    );
    useDemo(true);
    sanitizeState(); // само градът; кошницата не се пипа
    if (hooks.offline) hooks.offline(err);
  }

  async function connect() {
    try {
      const raw = await http("/meta/init", { timeout: 4000 });
      const meta = normMeta(raw);
      if (!meta.categories.length || !meta.settlements.length)
        throw new Error("Празен отговор от /meta/init");
      rt.mode = "live";
      rt.offline = false;
      applyMeta(meta);
      rt.histories.clear();
      return true;
    } catch (e) {
      console.info("[SmartBasket] Няма връзка с API:", e && e.message);
      return false;
    }
  }

  const Data = {
    async optimize() {
      if (rt.mode === "live") {
        try {
          return await http("/basket/optimize", {
            method: "POST",
            body: buildPayload(),
          });
        } catch (e) {
          if (!isOutage(e)) throw e;
          goOffline(e);
        }
      }
      return DEMO.optimize(buildPayload());
    },

    async products(params) {
      if (rt.mode === "live") {
        try {
          const q = new URLSearchParams();
          Object.keys(params).forEach((k) => {
            const v = params[k];
            if (v === undefined || v === null || v === "" || v === false)
              return;
            q.set(k, v === true ? "true" : String(v));
          });
          const rows = await http(`/products?${q.toString()}`);
          return rows.map(normProduct);
        } catch (e) {
          if (!isOutage(e)) throw e;
          goOffline(e);
        }
      }
      return DEMO.products(params).map(normProduct);
    },

    async history(productId) {
      if (rt.mode === "live") {
        try {
          const raw = await http(
            `/products/${encodeURIComponent(productId)}/history?ekatte_code=${encodeURIComponent(state.ekatte_code)}`,
          );
          return normHistory(raw);
        } catch (e) {
          if (e && e.status === 404) return null;
          if (!isOutage(e)) throw e;
          goOffline(e);
        }
      }
      return normHistory(DEMO.history(productId, state.ekatte_code));
    },
  };

  function getHistory(productId) {
    const key = `${rt.mode}|${state.ekatte_code}|${productId}`;
    if (!rt.histories.has(key)) {
      const p = Data.history(productId).catch((err) => {
        rt.histories.delete(key);
        throw err;
      });
      rt.histories.set(key, p);
    }
    return rt.histories.get(key);
  }

  /* ───────────────────────── аналитика ───────────────────────── */
  const hasPromo = (it) =>
    state.include_promos &&
    it.unit_promo_price != null &&
    it.unit_promo_price < it.unit_regular_price - 1e-9;

  function visibleRankings() {
    if (!rt.result) return [];
    const ex = new Set(state.excluded_chains);
    return rt.result.rankings.filter((r) => !ex.has(r.chain_name));
  }

  /** category -> Map(chain -> item) */
  function buildTable(rk) {
    const table = new Map();
    rk.forEach((r) =>
      r.matched_items.forEach((it) => {
        if (!table.has(it.category_id)) table.set(it.category_id, new Map());
        table
          .get(it.category_id)
          .set(r.chain_name, Object.assign({ chain: r.chain_name }, it));
      }),
    );
    return table;
  }

  function combos(arr, k) {
    const out = [];
    (function rec(start, cur) {
      if (cur.length === k) {
        out.push(cur.slice());
        return;
      }
      for (let i = start; i < arr.length; i++) {
        cur.push(arr[i]);
        rec(i + 1, cur);
        cur.pop();
      }
    })(0, []);
    return out;
  }

  function planForChains(table, chains) {
    const per = new Map();
    let total = 0;
    state.items.forEach((basketItem) => {
      const byChain = table.get(basketItem.category_id);
      if (!byChain) return;
      let best = null;
      chains.forEach((ch) => {
        const it = byChain.get(ch);
        if (it && (!best || it.line_total < best.line_total - 1e-9)) best = it;
      });
      if (!best) return;
      total += best.line_total;
      if (!per.has(best.chain)) per.set(best.chain, []);
      per.get(best.chain).push(best);
    });
    const stores = [...per.entries()]
      .map(([chain, items]) => ({
        chain,
        items,
        subtotal:
          Math.round(items.reduce((a, b) => a + b.line_total, 0) * 100) / 100,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
    return { total: Math.round(total * 100) / 100, stores };
  }

  function bestPlan(table, names, k) {
    let best = null;
    combos(names, Math.min(k, names.length)).forEach((c) => {
      const p = planForChains(table, c);
      if (!best || p.total < best.total - 1e-9) best = p;
    });
    if (best) best.k = k;
    return best;
  }

  function cheapestFor(table, catId) {
    const byChain = table.get(catId);
    if (!byChain) return null;
    let best = null;
    byChain.forEach((it) => {
      if (!best || it.line_total < best.line_total) best = it;
    });
    return best
      ? {
          chain: best.chain,
          unit: best.qty ? best.line_total / best.qty : best.line_total,
          item: best,
        }
      : null;
  }

  function deriveView() {
    const rk = visibleRankings();
    if (!rk.length) {
      rt.view = null;
      return;
    }
    const table = buildTable(rk);
    const names = rk.map((r) => r.chain_name);
    const maxK = Math.min(3, rk.length);
    const plans = {};
    for (let k = 1; k <= maxK; k++) plans[k] = bestPlan(table, names, k);
    rt.view = { rk, best: rk[0], worst: rk[rk.length - 1], table, plans, maxK };
  }

  /* ───── история: статистики, честна отстъпка, сигнал за манипулация ───── */
  function analyzeHistory(h, range) {
    const n = h.dates.length;
    const reg = h.regular_prices;
    const pro = h.promo_prices;
    const eff = reg.map((r, i) => (pro[i] != null ? pro[i] : r));
    const start = Math.max(0, n - range);
    const win = eff.slice(start);
    const cur = eff[n - 1];
    const min = Math.min.apply(null, win);
    const max = Math.max.apply(null, win);
    const avg = win.reduce((a, b) => a + b, 0) / win.length;
    const promoActive = pro[n - 1] != null;
    const out = {
      n,
      start,
      eff,
      cur,
      min,
      max,
      avg,
      vsAvg: avg ? (cur - avg) / avg : 0,
      promoActive,
      regNow: reg[n - 1],
      promoNow: pro[n - 1],
      ps: null,
      adv: null,
      ref: null,
      real: null,
      hike: null,
    };
    if (promoActive) {
      let ps = n - 1;
      while (ps > 0 && pro[ps - 1] != null) ps--;
      out.ps = ps;
      out.adv = reg[n - 1] > 0 ? (reg[n - 1] - pro[n - 1]) / reg[n - 1] : 0;
      const startMs = ts(h.dates[ps]);
      const prior = [];
      for (let i = 0; i < ps; i++)
        if (ts(h.dates[i]) >= startMs - 30 * DAY) prior.push(eff[i]);
      if (prior.length) {
        out.ref = Math.min.apply(null, prior);
        out.real = out.ref > 0 ? (out.ref - pro[n - 1]) / out.ref : 0;
      }
      const baseMs = startMs - 7 * DAY;
      const winIdx = [];
      let before = null;
      for (let i = 0; i < n; i++) {
        const t = ts(h.dates[i]);
        if (t >= baseMs && t < startMs) winIdx.push(i);
        else if (t < baseMs) before = i;
      }
      if (winIdx.length && before != null) {
        const mx = Math.max.apply(
          null,
          winIdx.map((i) => reg[i]),
        );
        if (mx > reg[before])
          out.hike = {
            from: reg[before],
            to: mx,
            fromIdx: winIdx[0],
            toIdx: ps,
          };
      }
    }
    return out;
  }

  function verdictFor(h, a) {
    if (!a.promoActive) {
      return {
        tone: "neutral",
        title: "Няма активна промоция",
        text: `Текущата цена е ${eur(a.cur)}${Math.abs(a.vsAvg) >= 0.01 ? `, ${fmtPct(a.vsAvg).replace("+", "")} ${a.vsAvg > 0 ? "над" : "под"} средната за периода` : ", близо до средната за периода"}.`,
      };
    }
    if (h.fake_discount_warning) {
      return {
        tone: "warn",
        title: "Сигнал: цената е вдигната преди „промоцията“",
        text: "Базовата цена е била повишена в рамките на 7 дни преди началото на намалението. Сравнете с цената отпреди повишението, преди да решите, че е изгодно.",
      };
    }
    if (a.real != null && a.real <= 0.005) {
      return {
        tone: "warn",
        title: "Не е по-евтино от обичайното",
        text: `Промоционалната цена не е по-ниска от най-ниската цена през предходните 30 дни (${eur(a.ref)}).`,
      };
    }
    if (a.real != null && a.adv - a.real > 0.05) {
      return {
        tone: "warn",
        title: "Отстъпката е по-малка от рекламираната",
        text: `Спрямо базовата цена е −${pct0(a.adv)}, но спрямо най-ниската цена за 30 дни преди промоцията (${eur(a.ref)}) е само −${pct0(a.real)}.`,
      };
    }
    return {
      tone: "good",
      title: "Изглежда като реална отстъпка",
      text: `−${pct0(a.adv)} спрямо базовата цена${a.real != null ? ` и −${pct0(a.real)} спрямо най-ниската цена за 30 дни преди промоцията` : ""}. Няма сигнал за скрито повишение.`,
    };
  }

  /* ───── лична инфлация от история на базовите цени ───── */
  function computeTrend(items, hs) {
    const rows = [];
    const usable = [];
    items.forEach((it, i) => {
      const h = hs[i];
      if (!h || h.dates.length < 8) return;
      const last = h.dates.length - 1;
      const lastMs = ts(h.dates[last]);
      let j = 0;
      while (j < last && ts(h.dates[j]) < lastMs - 30 * DAY) j++;
      if (last - j < 6) return;
      const now = h.regular_prices[last];
      const then = h.regular_prices[j];
      if (!(then > 0) || !(now > 0)) return;
      rows.push({
        name: it.product_name,
        category_id: it.category_id,
        qty: it.qty,
        now,
        then,
        delta: (now - then) * it.qty,
        pct: (now - then) / then,
      });
      usable.push({ it, h });
    });
    if (!rows.length) return { state: "empty" };
    const sumNow = rows.reduce((a, r) => a + r.now * r.qty, 0);
    const sumThen = rows.reduce((a, r) => a + r.then * r.qty, 0);
    const baseDates = usable[0].h.dates.slice(-30);
    const series = baseDates.map((d) => {
      let total = 0;
      usable.forEach(({ it, h }) => {
        let idx = 0;
        for (let i = 0; i < h.dates.length; i++) {
          if (h.dates[i] <= d) idx = i;
          else break;
        }
        total += h.regular_prices[idx] * it.qty;
      });
      return total;
    });
    rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return {
      state: "ready",
      pct: (sumNow - sumThen) / sumThen,
      delta: sumNow - sumThen,
      rows,
      series,
      covered: rows.length,
      total: items.length,
    };
  }

  /* ───────────────────────── export ───────────────────────── */
  window.SB = {
    DEMO,
    API,
    DAY,
    DEFAULTS,
    clone,
    clamp,
    norm,
    ts,
    eur,
    signedEur,
    fmtPct,
    pct0,
    plural,
    fmtNum,
    mapLimit,
    state,
    saveState,
    cleanItems,
    rt,
    hooks,
    normMeta,
    normResult,
    demoMeta,
    applyMeta,
    sanitizeState,
    useDemo,
    connect,
    Data,
    getHistory,
    buildPayload,
    hasPromo,
    visibleRankings,
    buildTable,
    bestPlan,
    planForChains,
    cheapestFor,
    deriveView,
    analyzeHistory,
    verdictFor,
    computeTrend,
  };
})();
