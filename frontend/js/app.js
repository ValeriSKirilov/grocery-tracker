/* ==========================================================================
   Колко струва — UI слой (рендериране, събития, графики).
   Зависи от js/demo-data.js и js/core.js (window.SB).
   ========================================================================== */
(() => {
  "use strict";

  const SB = window.SB;
  const {
    state,
    rt,
    hooks,
    clone,
    clamp,
    norm,
    ts,
    eur,
    signedEur,
    fmtPct,
    pct0,
    plural,
    mapLimit,
    saveState,
    cleanItems,
    connect,
    sanitizeState,
    normResult,
    Data,
    getHistory,
    hasPromo,
    visibleRankings,
    deriveView,
    cheapestFor,
    analyzeHistory,
    verdictFor,
    computeTrend,
  } = SB;

  /* ───────────────────────── DOM helpers ───────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const REDUCED = !!(
    window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const mobileMQ = window.matchMedia
    ? matchMedia("(max-width: 1080px)")
    : { matches: false };
  const catalog = {
    rows: [],
    categoryIndex: [],
    loading: false,
    loaded: false,
    error: false,
    query: "",
    group: "all",
    shown: 12,
    requestId: 0,
    productSearchText: new WeakMap(),
    expandedStores: new Set(),
    expandedChainGroups: new Set(),
    collapsedGroups: new Set(),
    storeSortByCategory: new Map(),
  };
  const CATALOG_DEFAULT_OFFERS = 3;
  const CATALOG_DEFAULT_STORES = 5;
  let booted = false;

  /* ───────────────────────── icons ───────────────────────── */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    monitor:
      '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    alert:
      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
    "trend-up": '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    "trend-down": '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    printer:
      '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    refresh:
      '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.5 5.7L21 8"/><path d="M21 3v5h-5"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    sparkles:
      '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
    wallet:
      '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="17" cy="14" r="1"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    "list-check": '<path d="m3 6 2 2 4-4M3 14l2 2 4-4M13 7h8M13 15h8"/>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    layers:
      '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  };
  const icon = (name, size = 18) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  const hydrateIcons = (root) =>
    $$("[data-icon]", root).forEach((el) => {
      if (!el.firstChild)
        el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
    });

  /* ───────────────────────── конфигурация на съдържанието ───────────────────────── */
  const POPULAR_IDS = [12, 20, 1, 18, 45, 31, 52, 4, 15, 901, 903, 906];
  const TEMPLATES = [
    {
      id: "week",
      emoji: "🛒",
      name: "Седмична за двама",
      desc: "Основното за седмицата",
      items: [
        [12, 2],
        [15, 2],
        [20, 1],
        [1, 2],
        [18, 1],
        [31, 1],
        [45, 1],
        [52, 1],
        [901, 1],
      ],
    },
    {
      id: "breakfast",
      emoji: "🥐",
      name: "Закуска",
      desc: "Мляко, яйца, хляб и масло",
      items: [
        [12, 1],
        [20, 1],
        [1, 1],
        [906, 1],
        [15, 1],
      ],
    },
    {
      id: "student",
      emoji: "🍝",
      name: "Студентска кошница",
      desc: "Евтино и засищащо",
      items: [
        [905, 2],
        [904, 1],
        [20, 1],
        [45, 1],
        [52, 1],
        [1, 1],
      ],
    },
    {
      id: "baking",
      emoji: "🍰",
      name: "Печене",
      desc: "Брашно, яйца, захар, масло",
      items: [
        [4, 2],
        [20, 2],
        [908, 1],
        [906, 2],
        [12, 1],
      ],
    },
    {
      id: "dairy",
      emoji: "🧀",
      name: "Млечна кошница",
      desc: "Сирене, кашкавал, кисело мляко",
      items: [
        [18, 1],
        [907, 1],
        [15, 3],
        [12, 2],
        [906, 1],
      ],
    },
    {
      id: "basics",
      emoji: "📦",
      name: "Основни продукти",
      desc: "Началната ти кошница",
      items: [
        [12, 2],
        [20, 1],
        [1, 1],
        [18, 1],
      ],
    },
  ];
  const CHAIN_COLORS = {
    Billa: "#e11d48",
    Kaufland: "#6366f1",
    Lidl: "#0ea5e9",
    Fantastico: "#f59e0b",
  };
  const EXTRA_COLORS = [
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#84cc16",
  ];
  function chainColor(name) {
    if (CHAIN_COLORS[name]) return CHAIN_COLORS[name];
    let h = 0;
    for (let i = 0; i < name.length; i++)
      h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return EXTRA_COLORS[h % EXTRA_COLORS.length];
  }
  const avatar = (name) =>
    `<span class="chain-av" style="--c:${chainColor(name)}" aria-hidden="true">${esc(String(name).trim().slice(0, 1).toUpperCase())}</span>`;

  const catOf = (id) => rt.catById.get(id) || rt.knownCats.get(id);
  const catName = (id) => (catOf(id) ? catOf(id).name : `Категория #${id}`);
  const catGroup = (id) => (catOf(id) ? catOf(id).group : "Други");
  const shortName = (c) =>
    c.short || c.name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const cityName = () =>
    (rt.settlementByCode.get(state.ekatte_code) || {}).name ||
    state.ekatte_code;
  const countLabel = (n, one, many) => `${n} ${plural(n, one, many)}`;

  /* ───────────────────────── тема ───────────────────────── */
  const THEME_KEY = "grocery-tracker-theme";
  const THEME_CYCLE = ["system", "light", "dark"];
  const THEME_LABEL = { system: "Автоматична", light: "Светла", dark: "Тъмна" };
  const darkMQ = window.matchMedia
    ? matchMedia("(prefers-color-scheme: dark)")
    : null;
  let themeMode = "system";
  try {
    themeMode = localStorage.getItem(THEME_KEY) || "system";
  } catch (_) {
    /* ignore */
  }
  if (!THEME_CYCLE.includes(themeMode)) themeMode = "system";
  const resolvedTheme = () =>
    themeMode === "dark" || (themeMode === "system" && darkMQ && darkMQ.matches)
      ? "dark"
      : "light";

  function applyTheme() {
    const t = resolvedTheme();
    document.documentElement.dataset.theme = t;
    const meta = $('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", t === "dark" ? "#0a100e" : "#f4f6f4");
    $("#theme-icon").innerHTML = icon(
      themeMode === "system"
        ? "monitor"
        : themeMode === "dark"
          ? "moon"
          : "sun",
    );
    const btn = $("#theme-toggle");
    btn.title = `Тема: ${THEME_LABEL[themeMode]}`;
    btn.setAttribute(
      "aria-label",
      `Тема: ${THEME_LABEL[themeMode]}. Натисни за смяна.`,
    );
    if (booted && state.tab === "history") drawHistory();
  }
  function cycleTheme() {
    themeMode =
      THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    try {
      localStorage.setItem(THEME_KEY, themeMode);
    } catch (_) {
      /* ignore */
    }
    applyTheme();
    toast(`Тема: ${THEME_LABEL[themeMode].toLowerCase()}`);
  }

  /* ───────────────────────── toast ───────────────────────── */
  function toast(msg, opts = {}) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast" + (opts.type === "warn" ? " warn" : "");
    el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(msg)}</span>`;
    const dismiss = () => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 260);
    };
    if (opts.action) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = opts.action.label;
      b.addEventListener("click", () => {
        opts.action.fn();
        dismiss();
      });
      el.appendChild(b);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(dismiss, opts.action ? 7000 : 3600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (_e) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  function animateMoney(el, from, to) {
    if (!el) return;
    cancelAnimationFrame(el._raf);
    if (REDUCED || from == null || Math.abs(from - to) < 0.005) {
      el.textContent = eur(to);
      return;
    }
    const t0 = performance.now();
    const dur = 520;
    el.textContent = eur(from);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = eur(from + (to - from) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  function sparkline(vals, up) {
    if (!vals || vals.length < 2) return "";
    const w = 120;
    const h = 34;
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => [
      (i / (vals.length - 1)) * w,
      h - 4 - ((v - min) / span) * (h - 8),
    ]);
    const d = pts
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(" ");
    return `<svg class="spark${up ? " up" : ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-area" d="${d} L${w} ${h} L0 ${h} Z"/><path class="spark-line" d="${d}"/></svg>`;
  }

  /* ───────────────────────── combobox ───────────────────────── */
  function createCombo({ input, list, getOptions, onPick, keepOpen = false }) {
    let opts = [];
    let active = -1;
    let open = false;
    const setOpen = (v) => {
      open = v;
      list.hidden = !v;
      input.setAttribute("aria-expanded", String(v));
      if (!v) input.removeAttribute("aria-activedescendant");
    };
    const render = () => {
      if (!opts.length) {
        list.innerHTML = `<li class="combo-empty">Няма резултати</li>`;
        return;
      }
      list.innerHTML =
        opts
          .map(
            (o, i) =>
              `<li role="option" id="${list.id}-${i}" data-i="${i}" class="combo-opt${i === active ? " active" : ""}" aria-selected="${i === active}">${o.html}</li>`,
          )
          .join("") +
        (opts.more ? `<li class="combo-more">${esc(opts.more)}</li>` : "");
      if (active >= 0) {
        input.setAttribute("aria-activedescendant", `${list.id}-${active}`);
        const el = list.children[active];
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
      }
    };
    const refresh = () => {
      opts = getOptions(input.value.trim());
      active = opts.length ? 0 : -1;
      render();
      setOpen(true);
    };
    const pick = (o) => {
      onPick(o);
      if (keepOpen) refresh();
      else setOpen(false);
    };
    input.addEventListener("input", refresh);
    input.addEventListener("focus", () => {
      if (input.select) input.select();
      refresh();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) refresh();
        else {
          active = Math.min(opts.length - 1, active + 1);
          render();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(0, active - 1);
        render();
      } else if (e.key === "Enter") {
        if (open && active >= 0 && opts[active]) {
          e.preventDefault();
          pick(opts[active]);
        }
      } else if (e.key === "Escape") {
        if (open) {
          setOpen(false);
          e.stopPropagation();
        }
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("[data-i]");
      if (!li) return;
      e.preventDefault();
      pick(opts[Number(li.dataset.i)]);
    });
    document.addEventListener("mousedown", (e) => {
      if (open && !list.contains(e.target) && e.target !== input)
        setOpen(false);
    });
    input.addEventListener("blur", () => setTimeout(() => setOpen(false), 120));
    return { close: () => setOpen(false), refresh };
  }

  function cityOptions(q) {
    if (q === cityName()) q = "";
    const s = norm(q);
    const all = rt.meta.settlements;
    const list = s
      ? all.filter((x) => norm(x.name).includes(s) || x.code.includes(s))
      : all.slice();
    if (s)
      list.sort(
        (a, b) =>
          (norm(a.name).startsWith(s) ? 0 : 1) -
          (norm(b.name).startsWith(s) ? 0 : 1),
      );
    const out = list.slice(0, 8).map((x) => ({
      value: x,
      html: `<span class="co-main"><span class="co-name">${esc(x.name)}</span></span>${x.code === state.ekatte_code ? `<span class="combo-tag">${icon("check", 12)}</span>` : `<span class="muted">${esc(x.code)}</span>`}`,
    }));
    if (list.length > 8)
      out.more = `Още ${list.length - 8} — продължи да пишеш`;
    return out;
  }

  function categoryOptions(q) {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const inBasket = new Map(state.items.map((i) => [i.category_id, i.qty]));
    let list = rt.meta.categories;
    if (tokens.length) {
      list = list.filter((c) => {
        const hay = norm(`${c.name} ${c.group}`);
        return tokens.every((t) => hay.includes(t));
      });
      list.sort(
        (a, b) =>
          (norm(a.name).startsWith(tokens[0]) ? 0 : 1) -
          (norm(b.name).startsWith(tokens[0]) ? 0 : 1),
      );
    }
    const out = list.slice(0, 40).map((c) => ({
      value: c,
      html: `<span class="co-main"><span class="co-name">${esc(c.name)}</span><span class="co-sub">${esc(c.group)}</span></span>${inBasket.has(c.id) ? `<span class="combo-tag">×${inBasket.get(c.id)}</span>` : ""}`,
    }));
    if (list.length > 40)
      out.more = `Още ${list.length - 40} — пиши, за да стесниш търсенето`;
    return out;
  }

  /* ───────────────────────── мутации на кошницата ───────────────────────── */
  let refreshTimer = null;
  function scheduleRefresh(delay = 220) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }
  function commitBasket() {
    saveState();
    renderBasket();
    renderMobileBar();
    scheduleRefresh();
  }
  function addCategory(id, qty = 1, opts = {}) {
    const ex = state.items.find((i) => i.category_id === id);
    if (ex) ex.qty = clamp(ex.qty + qty, 1, 99);
    else state.items.push({ category_id: id, qty: clamp(qty, 1, 99) });
    commitBasket();
    if (!opts.silent) toast(`Добавено: ${catName(id)}`);
  }
  function changeQty(id, delta) {
    const it = state.items.find((i) => i.category_id === id);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) {
      removeItem(id);
      return;
    }
    it.qty = clamp(it.qty, 1, 99);
    commitBasket();
  }
  function removeItem(id) {
    const before = clone(state.items);
    state.items = state.items.filter((i) => i.category_id !== id);
    commitBasket();
    toast(`Премахнато: ${catName(id)}`, {
      action: {
        label: "Върни",
        fn: () => {
          state.items = before;
          commitBasket();
        },
      },
    });
  }
  function replaceBasket(items, label) {
    const before = clone(state.items);
    state.items = cleanItems(
      items.filter((i) => rt.catById.has(i.category_id)),
    );
    commitBasket();
    toast(label, {
      action: {
        label: "Върни",
        fn: () => {
          state.items = before;
          commitBasket();
        },
      },
    });
  }
  function clearBasket() {
    if (!state.items.length) return;
    replaceBasket([], "Кошницата е изчистена");
  }
  function setCity(code, opts = {}) {
    if (!code || code === state.ekatte_code) return;
    state.ekatte_code = code;
    saveState();
    rt.deals.loaded = false;
    rt.deals.all = [];
    rt.deals.verified.clear();
    rt.deals.shown = 12;
    catalog.loaded = false;
    catalog.rows = [];
    catalog.categoryIndex = [];
    catalog.shown = 12;
    rt.prevBest = null;
    $("#city-input").value = cityName();
    if (state.tab === "catalog") loadCatalog();
    if (state.tab === "deals") loadDeals();
    scheduleRefresh(0);
    if (!opts.silent) toast("Цените са за " + cityName());
  }

  /* ───────────────────────── зареждане на резултатите ───────────────────────── */
  async function refresh() {
    clearTimeout(refreshTimer);
    const seq = ++rt.reqSeq;
    rt.diagnosis = null;
    if (!state.items.length) {
      rt.result = null;
      rt.error = null;
      rt.loading = false;
      rt.trend = null;
      renderAll();
      return;
    }
    rt.loading = true;
    rt.error = null;
    renderCompare();
    try {
      const raw = await Data.optimize();
      if (seq !== rt.reqSeq) return;
      rt.result = normResult(raw);
      // ако всички вериги са скрити (напр. от друг град) — нулираме филтъра
      const names = rt.result.rankings.map((r) => r.chain_name);
      if (
        names.length &&
        names.every((n) => state.excluded_chains.includes(n))
      ) {
        state.excluded_chains = state.excluded_chains.filter(
          (c) => !names.includes(c),
        );
        saveState();
      }
    } catch (err) {
      if (seq !== rt.reqSeq) return;
      console.error(err);
      rt.result = null;
      rt.error = err;
    }
    rt.loading = false;
    renderAll();
    if (rt.result && !rt.result.rankings.length && rt.mode === "live")
      diagnoseEmpty(seq);
    loadTrend();
  }

  async function diagnoseEmpty(seq) {
    const cats = state.items.map((i) => i.category_id);
    const res = await mapLimit(cats, 4, (id) =>
      Data.products({ ekatte_code: state.ekatte_code, category_id: id }),
    );
    if (seq !== rt.reqSeq) return;
    rt.diagnosis = cats.map((id, i) => ({
      id,
      chains: Array.from(new Set((res[i] || []).map((p) => p.chain_name))),
    }));
    renderCompare();
  }

  async function loadTrend() {
    const token = ++rt.trendToken;
    const v = rt.view;
    if (!v) {
      rt.trend = null;
      return;
    }
    rt.trend = { state: "loading" };
    renderTrend();
    const items = v.best.matched_items;
    const hs = await mapLimit(items, 5, (it) => getHistory(it.product_id));
    if (token !== rt.trendToken) return;
    rt.trend = computeTrend(items, hs);
    renderTrend();
  }

  /* ───────────────────────── рендер: общ ───────────────────────── */
  function renderAll() {
    deriveView();
    renderBasket();
    renderCompare();
    renderPlan();
    renderMobileBar();
    if (state.tab === "catalog") renderCatalog();
    if (state.tab === "deals") renderDeals();
    if (state.tab === "history") drawHistory();
    else renderHistoryControls();
  }

  function renderMobileBar() {
    const n = state.items.length;
    $("#mobile-count").textContent = n
      ? `${countLabel(n, "продукт", "продукта")} в кошницата`
      : "Кошницата е празна";
    $("#mobile-total").textContent = rt.view
      ? `Най-евтино: ${eur(rt.view.best.total_cost)} · ${rt.view.best.chain_name}`
      : "Добави продукти";
  }

  function updateStatus() {
    const b = $("#api-status");
    b.dataset.mode = rt.mode;
    $("#api-status-text").textContent =
      rt.mode === "live"
        ? "Live API"
        : rt.offline
          ? "Офлайн · демо данни"
          : "Демо данни";
    b.title =
      rt.mode === "live"
        ? "Свързан с бекенда. Кликни за повторна проверка."
        : "Показваме примерни данни. Кликни, за да опиташ връзка с API-то.";
  }

  /* ───────────────────────── рендер: кошница ───────────────────────── */
  function renderBasket() {
    const items = state.items;
    const qtyTotal = items.reduce((a, i) => a + i.qty, 0);
    $("#basket-sub").textContent = items.length
      ? `${countLabel(items.length, "продукт", "продукта")} · ${qtyTotal} бр.`
      : "Все още е празна";

    const ul = $("#basket-items");
    if (!items.length) {
      ul.innerHTML = `<li class="b-empty"><div class="b-empty-ic">${icon("cart", 26)}</div><strong>Кошницата е празна</strong><p>Потърси продукт по-горе или започни с готова кошница.</p><button type="button" class="btn btn-soft btn-sm" data-open-baskets>Готови кошници</button></li>`;
    } else {
      ul.innerHTML = items
        .map((it) => {
          const cat = catOf(it.category_id);
          const ch = rt.view
            ? cheapestFor(rt.view.table, it.category_id)
            : null;
          const meta = ch
            ? `най-евтино <b>${eur(ch.unit)}</b> · ${esc(ch.chain)}`
            : esc(cat ? cat.group : "");
          return `<li class="b-item" data-cat="${it.category_id}">
            <div class="b-main"><span class="b-name" title="${esc(catName(it.category_id))}">${esc(catName(it.category_id))}</span><span class="b-meta">${meta}</span></div>
            <div class="qty" role="group" aria-label="Количество">
              <button type="button" class="qty-btn" data-act="dec" aria-label="Намали количеството">−</button>
              <span class="qty-val" aria-live="polite">${it.qty}</span>
              <button type="button" class="qty-btn" data-act="inc" aria-label="Увеличи количеството">+</button>
            </div>
            <button type="button" class="icon-btn sm danger" data-act="remove" aria-label="Премахни ${esc(catName(it.category_id))}">${icon("x", 14)}</button>
          </li>`;
        })
        .join("");
    }
    renderQuickChips();
    renderBudget();
    renderSidebarTotal();
  }

  function renderQuickChips() {
    const inBasket = new Set(state.items.map((i) => i.category_id));
    let cats = POPULAR_IDS.filter(
      (id) => rt.catById.has(id) && !inBasket.has(id),
    )
      .slice(0, 5)
      .map((id) => rt.catById.get(id));
    if (cats.length < 3) {
      const extra = rt.meta.categories
        .filter((c) => !inBasket.has(c.id) && !cats.includes(c))
        .slice(0, 5 - cats.length);
      cats = cats.concat(extra);
    }
    $("#quick-chips").innerHTML = cats.length
      ? `<span class="chips-label">Предложения:</span>` +
        cats
          .map(
            (c) =>
              `<button type="button" class="chip" data-quick="${c.id}">${icon("plus", 12)} ${esc(shortName(c))}</button>`,
          )
          .join("")
      : "";
  }

  function renderBudget() {
    const meter = $("#budget-meter");
    const b = state.budget;
    if (!b || !rt.view) {
      meter.hidden = true;
      return;
    }
    const total = rt.view.best.total_cost;
    const ratio = total / b;
    const left = b - total;
    meter.hidden = false;
    meter.dataset.tone = ratio > 1 ? "over" : ratio > 0.85 ? "warn" : "ok";
    meter.innerHTML = `<div class="meter-track"><i style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></i></div><span>${left >= 0 ? `Остават ${eur(left)} от бюджета` : `Над бюджета с ${eur(-left)}`}</span>`;
  }

  let prevSide = null;
  function renderSidebarTotal() {
    const el = $("#sidebar-lowest-total");
    const v = rt.view;
    if (!v) {
      el.textContent =
        state.items.length && rt.loading
          ? "…"
          : state.items.length
            ? "—"
            : eur(0);
      $("#sidebar-lowest-chain").textContent = "";
      prevSide = null;
      return;
    }
    animateMoney(el, prevSide, v.best.total_cost);
    prevSide = v.best.total_cost;
    $("#sidebar-lowest-chain").textContent = `в ${v.best.chain_name}`;
  }

  /* ───────────────────────── рендер: сравнение ───────────────────────── */
  function emptyStateHTML() {
    const tpl = TEMPLATES.filter(
      (t) => t.items.filter(([id]) => rt.catById.has(id)).length >= 2,
    ).slice(0, 3);
    return `<div class="state-card">
      <div class="state-ic">${icon("cart", 30)}</div>
      <h3>Започни със своята кошница</h3>
      <p>Добави продукти отляво и веднага ще видиш в коя верига са най-евтини, кои промоции са истински и как да пазаруваш най-изгодно.</p>
      <div class="state-actions">
        ${tpl.map((t) => `<button type="button" class="btn btn-soft" data-template="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join("")}
        <button type="button" class="btn btn-ghost" data-focus-search>${icon("search", 16)} Търси продукт</button>
      </div>
    </div>`;
  }
  function errorStateHTML() {
    return `<div class="state-card warn">
      <div class="state-ic">${icon("alert", 30)}</div>
      <h3>Не успяхме да изчислим кошницата</h3>
      <p>${esc(rt.error && rt.error.message ? rt.error.message : "Възникна грешка при връзката с данните.")}</p>
      <div class="state-actions"><button type="button" class="btn btn-primary" data-retry>${icon("refresh", 16)} Опитай отново</button></div>
    </div>`;
  }
  function noDataStateHTML() {
    const diag = rt.diagnosis;
    let body = "";
    if (diag) {
      const rows = diag
        .map((d) => {
          const bad =
            d.chains.length < Math.max(...diag.map((x) => x.chains.length));
          return `<div class="diag-row${bad ? " bad" : ""}"><span><b>${esc(catName(d.id))}</b><br><small>${d.chains.length ? "Налично във: " + esc(d.chains.join(", ")) : "Няма данни в това населено място"}</small></span><button type="button" class="btn btn-ghost btn-sm" data-remove-cat="${d.id}">Премахни</button></div>`;
        })
        .join("");
      body = `<div class="diag">${rows}</div>`;
    } else if (rt.mode === "live") {
      body = `<div class="diag"><div class="skel" style="height:44px"></div><div class="skel" style="height:44px"></div></div>`;
    }
    return `<div class="state-card warn">
      <div class="state-ic">${icon("info", 30)}</div>
      <h3>Няма верига с всички избрани продукти</h3>
      <p>Показваме само вериги, които имат данни за <b>всеки</b> продукт в кошницата в ${esc(cityName())}. Премахни продукта, който липсва, или опитай с друго населено място.</p>
      ${body}
    </div>`;
  }

  function heroHTML(v) {
    const { best, worst } = v;
    const spread = worst.total_cost - best.total_cost;
    const promoSave = state.include_promos ? best.total_promo_savings : 0;
    const chips = [];
    if (v.rk.length > 1)
      chips.push(
        `<span class="hchip">${icon("trend-down", 14)} ${eur(spread)} по-евтино от ${esc(worst.chain_name)}</span>`,
      );
    if (promoSave > 0.004)
      chips.push(
        `<span class="hchip">${icon("tag", 14)} ${eur(promoSave)} от промоции</span>`,
      );
    if (state.budget) {
      const left = state.budget - best.total_cost;
      chips.push(
        left >= 0
          ? `<span class="hchip">${icon("wallet", 14)} ${eur(left)} остават от бюджета</span>`
          : `<span class="hchip alert">${icon("alert", 14)} ${eur(-left)} над бюджета</span>`,
      );
    }
    const p1 = v.plans[1];
    const p2 = v.maxK >= 2 ? v.plans[2] : null;
    const gain = p2 ? p1.total - p2.total : 0;
    const side =
      gain > 0.009
        ? `<aside class="hero-side">
            <span class="hero-side-label">${icon("sparkles", 14)} Умен план</span>
            <div class="hero-side-big">${eur(p2.total)}</div>
            <p class="hero-side-sub">с ${countLabel(p2.stores.length, "магазин", "магазина")} — спестяваш още ${eur(gain)}</p>
            <button type="button" class="btn btn-white btn-sm" data-goto="plan">Виж плана ${icon("arrow-right", 14)}</button>
          </aside>`
        : `<aside class="hero-side">
            <span class="hero-side-label">${icon("sparkles", 14)} Умен план</span>
            <div class="hero-side-big">Всичко на едно място</div>
            <p class="hero-side-sub">Разделянето между магазини не спестява повече от ${esc(best.chain_name)}.</p>
            <button type="button" class="btn btn-white btn-sm" data-goto="plan">Към списъка ${icon("arrow-right", 14)}</button>
          </aside>`;
    return `<section class="hero">
      <div class="hero-main">
        <span class="eyebrow">${icon("pin", 14)} Най-евтина кошница · ${esc(cityName())}</span>
        <div class="hero-chain">${avatar(best.chain_name)}<h2>${esc(best.chain_name)}</h2></div>
        <div class="hero-total" id="hero-total">${eur(best.total_cost)}</div>
        <div class="hero-chips">${chips.join("")}</div>
      </div>
      ${side}
    </section>`;
  }

  function renderCompare() {
    const hero = $("#hero");
    const body = $("#compare-body");
    const v = rt.view;
    body.classList.toggle("is-loading", rt.loading && !!v);

    if (!state.items.length) {
      hero.innerHTML = emptyStateHTML();
      body.hidden = true;
      return;
    }
    if (rt.loading && !v) {
      hero.innerHTML = `<div class="skel skel-hero"></div>`;
      body.hidden = true;
      return;
    }
    if (rt.error) {
      hero.innerHTML = errorStateHTML();
      body.hidden = true;
      return;
    }
    if (!v) {
      hero.innerHTML = noDataStateHTML();
      body.hidden = true;
      return;
    }

    body.hidden = false;
    hero.innerHTML = heroHTML(v);
    animateMoney(
      $("#hero-total"),
      rt.prevBest == null ? 0 : rt.prevBest,
      v.best.total_cost,
    );
    rt.prevBest = v.best.total_cost;

    renderKpis(v);
    renderChainFilter();
    $("#results-message").textContent =
      `Класация на ${countLabel(v.rk.length, "верига", "вериги")} за ${countLabel(state.items.length, "продукт", "продукта")} в ${cityName()}.`;
    $$("#rank-seg [data-rank]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.rank === rt.rankView)),
    );
    $("#store-results").innerHTML =
      rt.rankView === "matrix" ? matrixHTML(v) : rankListHTML(v);
    renderTrend();
  }

  function renderKpis(v) {
    const best = v.best;
    const items = best.matched_items;
    const nPromo = items.filter(hasPromo).length;
    const save = state.include_promos ? best.total_promo_savings : 0;
    const share =
      best.total_cost + save > 0 ? save / (best.total_cost + save) : 0;
    $("#kpi-promo").innerHTML = `
      <span class="kpi-label">${icon("tag", 15)} Спестени от промоции</span>
      <div class="kpi-row"><strong class="kpi-value ${save > 0.004 ? "good" : ""}">${eur(save)}</strong><span class="kpi-chip ${save > 0.004 ? "good" : ""}">${state.include_promos ? `${pct0(share)} отстъпка` : "изключени"}</span></div>
      <p class="kpi-sub">${
        !state.include_promos
          ? "Промоциите са изключени от сметката"
          : nPromo
            ? `${nPromo} от ${countLabel(items.length, "продукт", "продукта")} в ${esc(best.chain_name)} са в промоция`
            : `Няма активни промоции в ${esc(best.chain_name)}`
      }</p>`;

    const p1 = v.plans[1];
    const g2 = v.plans[2] ? p1.total - v.plans[2].total : 0;
    const g3 = v.plans[3] ? p1.total - v.plans[3].total : 0;
    $("#kpi-split").innerHTML = `
      <span class="kpi-label">${icon("sparkles", 15)} Умно пазаруване</span>
      <div class="kpi-row"><strong class="kpi-value ${g2 > 0.009 ? "good" : ""}">${v.maxK >= 2 ? eur(Math.max(g2, 0)) : "—"}</strong><span class="kpi-chip ${g2 > 0.009 ? "good" : ""}">${v.maxK >= 2 ? "2 магазина" : "1 верига"}</span></div>
      <p class="kpi-sub">${
        v.maxK < 2
          ? "Нужни са поне 2 вериги с всички продукти"
          : g3 - g2 > 0.009
            ? `С 3 магазина — още ${eur(g3 - g2)} по-евтино`
            : `Спрямо всичко от ${esc(best.chain_name)}`
      }</p>`;
  }

  function renderChainFilter() {
    const names = rt.result.rankings.map((r) => r.chain_name);
    const ex = new Set(state.excluded_chains);
    const missing =
      rt.mode === "live"
        ? rt.meta.chains.filter((c) => !names.includes(c))
        : [];
    $("#chain-filter").innerHTML =
      `<span class="chips-label">Вериги:</span>` +
      names
        .map(
          (n) =>
            `<button type="button" class="chip ${ex.has(n) ? "" : "on"}" data-chain="${esc(n)}" aria-pressed="${!ex.has(n)}">${avatar(n)} ${esc(n)}</button>`,
        )
        .join("") +
      missing
        .map(
          (n) =>
            `<button type="button" class="chip" disabled title="Липсват данни за част от продуктите">${avatar(n)} ${esc(n)}</button>`,
        )
        .join("");
    $("#excluded-note").innerHTML = missing.length
      ? `<div class="note">${icon("info", 16)}<span>Не са включени: <b>${esc(missing.join(", "))}</b> — във веригата липсват данни за част от продуктите в кошницата.</span></div>`
      : "";
  }

  function rankListHTML(v) {
    const max = v.worst.total_cost || 1;
    return v.rk
      .map((r, idx) => {
        const delta = r.total_cost - v.best.total_cost;
        const open = rt.openTouched
          ? rt.openChains.has(r.chain_name)
          : idx === 0;
        const width = Math.max(22, Math.round((r.total_cost / max) * 100));
        const items = r.matched_items
          .map((it) => {
            const promo = hasPromo(it);
            return `<li><button type="button" class="line" data-hist="${esc(it.product_id)}" data-chain="${esc(r.chain_name)}" data-cat="${it.category_id}" data-name="${esc(it.product_name)}" title="Виж ценовата история">
              <span class="line-qty">${it.qty}×</span><span class="line-name">${esc(it.product_name)}</span>
              <span class="line-price">${promo ? `<s>${eur(it.unit_regular_price * it.qty)}</s>` : ""}<b class="${promo ? "is-promo" : ""}">${eur(it.line_total)}</b></span>
            </button></li>`;
          })
          .join("");
        return `<details class="rank${idx === 0 ? " best" : ""}" data-chain="${esc(r.chain_name)}"${open ? " open" : ""}>
          <summary class="rank-row">
            <span class="rank-pos">${idx === 0 ? "★" : idx + 1}</span>
            ${avatar(r.chain_name)}
            <span class="rank-name"><b>${esc(r.chain_name)}</b><small>${idx === 0 ? "Най-евтина" : `+${eur(delta)} спрямо най-евтината`}${state.include_promos && r.total_promo_savings > 0.004 ? ` · промоции −${eur(r.total_promo_savings)}` : ""}</small></span>
            <span class="rank-bar"><i style="width:${width}%"></i></span>
            <span class="rank-total">${eur(r.total_cost)}</span>
            <span class="rank-chev">${icon("chevron-down", 18)}</span>
          </summary>
          <ul class="rank-items">${items}</ul>
        </details>`;
      })
      .join("");
  }

  function matrixHTML(v) {
    const rows = state.items.filter((i) => v.table.has(i.category_id));
    const head = v.rk
      .map(
        (r) =>
          `<th scope="col"><span class="chain-head">${avatar(r.chain_name)}<span>${esc(r.chain_name)}</span></span></th>`,
      )
      .join("");
    const body = rows
      .map((i) => {
        const byChain = v.table.get(i.category_id);
        const min = Math.min.apply(
          null,
          Array.from(byChain.values()).map((x) => x.line_total),
        );
        const cells = v.rk
          .map((r) => {
            const it = byChain.get(r.chain_name);
            if (!it) return `<td>—</td>`;
            const promo = hasPromo(it);
            const best = Math.abs(it.line_total - min) < 1e-9;
            const disc = promo
              ? Math.round(
                  ((it.unit_regular_price - it.unit_promo_price) /
                    it.unit_regular_price) *
                    100,
                )
              : 0;
            return `<td><button type="button" class="cell${best ? " best" : ""}${promo ? " promo" : ""}" data-hist="${esc(it.product_id)}" data-chain="${esc(r.chain_name)}" data-cat="${it.category_id}" data-name="${esc(it.product_name)}" title="${esc(it.product_name)}">
              <b>${eur(it.line_total)}</b>
              <small>${promo ? `${icon("tag", 11)} −${disc}%` : it.qty > 1 ? `${eur(it.line_total / it.qty)}/бр.` : "&nbsp;"}</small>
            </button></td>`;
          })
          .join("");
        return `<tr><th scope="row"><span class="m-name" title="${esc(catName(i.category_id))}">${esc(catName(i.category_id))}</span><span class="m-qty">${i.qty} бр.</span></th>${cells}</tr>`;
      })
      .join("");
    const foot = v.rk.map((r) => `<td>${eur(r.total_cost)}</td>`).join("");
    return `<div class="matrix-wrap"><table class="matrix"><thead><tr><th scope="col">Продукт</th>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th scope="row">Общо</th>${foot}</tr></tfoot></table></div>`;
  }

  function renderTrend() {
    const v = rt.view;
    if (!v) return;
    const t = rt.trend;
    const kpi = $("#kpi-trend");
    const card = $("#trend-card");
    const label = `<span class="kpi-label">${icon("trend-up", 15)} Лична инфлация · 30 дни</span>`;
    const head = (extra) =>
      `<div class="panel-head"><div><h2>Какво се промени за 30 дни</h2><p class="muted">Базови цени (без промоции) на продуктите в ${esc(v.best.chain_name)}.</p></div>${extra || ""}</div>`;

    if (!t || t.state === "loading") {
      kpi.innerHTML = `${label}<div class="skel"></div><div class="skel" style="width:60%"></div>`;
      card.innerHTML =
        head() +
        `<div class="skel skel-row"></div><div class="skel skel-row"></div>`;
      return;
    }
    if (t.state === "empty") {
      kpi.innerHTML = `${label}<div class="kpi-row"><strong class="kpi-value">—</strong></div><p class="kpi-sub">Няма достатъчно история за тези продукти</p>`;
      card.innerHTML =
        head() +
        `<div class="state-inline">Все още няма достатъчно данни за ценова история на продуктите в кошницата.</div>`;
      return;
    }
    const up = t.pct > 0.0005;
    const down = t.pct < -0.0005;
    kpi.innerHTML = `${label}
      <div class="kpi-row"><strong class="kpi-value ${up ? "warn" : down ? "good" : ""}">${fmtPct(t.pct)}</strong><span class="kpi-chip ${up ? "warn" : down ? "good" : ""}">${signedEur(t.delta)}</span></div>
      <p class="kpi-sub">Кошницата в ${esc(v.best.chain_name)} спрямо преди месец</p>${sparkline(t.series, up)}`;
    const rows = t.rows.slice(0, 6);
    card.innerHTML =
      head(
        `<span class="kpi-chip ${up ? "warn" : down ? "good" : ""}">${fmtPct(t.pct)} общо · ${signedEur(t.delta)}</span>`,
      ) +
      `<div class="trend-list">${rows
        .map(
          (r) =>
            `<div class="trend-row"><span class="t-name" title="${esc(r.name)}">${esc(r.name)}</span><span class="t-prices">${eur(r.then)} → ${eur(r.now)}</span><span class="delta ${r.pct > 0.0005 ? "up" : r.pct < -0.0005 ? "down" : ""}">${fmtPct(r.pct)}</span></div>`,
        )
        .join("")}</div>` +
      (t.rows.length > 6
        ? `<p class="muted" style="margin-top:10px">и още ${t.rows.length - 6} продукта с по-малка промяна</p>`
        : "") +
      (t.covered < t.total
        ? `<p class="muted" style="margin-top:10px">Историята покрива ${t.covered} от ${t.total} продукта.</p>`
        : "");
  }

  /* ───────────────────────── рендер: план ───────────────────────── */
  const checkKey = (chain, cat) => `${state.ekatte_code}|${chain}|${cat}`;

  function currentPlan() {
    const v = rt.view;
    if (!v) return null;
    return v.plans[Math.min(state.max_stores, v.maxK)];
  }

  function renderPlan() {
    const v = rt.view;
    const optsEl = $("#plan-opts");
    const listsEl = $("#plan-lists");
    const sum = $("#plan-summary");
    const actions = $("#plan-actions");
    if (!v) {
      optsEl.innerHTML = "";
      listsEl.innerHTML = "";
      actions.hidden = true;
      sum.innerHTML = state.items.length
        ? rt.loading
          ? `<div class="skel skel-row"></div>`
          : `<div class="state-inline">Няма данни за план — виж таба „Сравнение“.</div>`
        : `<div class="state-inline">Добави продукти в кошницата, за да получиш план за пазаруване.</div>`;
      return;
    }
    const sel = Math.min(state.max_stores, v.maxK);
    const plan = v.plans[sel];
    optsEl.innerHTML = Array.from({ length: v.maxK }, (_, i) => {
      const k = i + 1;
      const p = v.plans[k];
      const gain = v.plans[1].total - p.total;
      return `<button type="button" class="plan-opt${k === sel ? " on" : ""}" role="radio" aria-checked="${k === sel}" data-k="${k}">
        <span class="po-k">${countLabel(k, "магазин", "магазина")}</span>
        <strong class="po-v">${eur(p.total)}</strong>
        <span class="po-d${gain > 0.009 ? " save" : ""}">${gain > 0.009 ? `−${eur(gain)} · ` : ""}${esc(p.stores.map((s) => s.chain).join(" + "))}</span>
      </button>`;
    }).join("");

    let remaining = 0;
    plan.stores.forEach((s) =>
      s.items.forEach((it) => {
        if (!state.checked[checkKey(it.chain, it.category_id)])
          remaining += it.line_total;
      }),
    );
    sum.innerHTML = `Общо <b>${eur(plan.total)}</b> в ${countLabel(plan.stores.length, "магазин", "магазина")} · спестяваш <b>${eur(v.worst.total_cost - plan.total)}</b> спрямо ${esc(v.worst.chain_name)}${
      remaining < plan.total - 0.004
        ? ` · остава за купуване <b>${eur(remaining)}</b>`
        : ""
    }.`;

    listsEl.innerHTML = plan.stores
      .map((s) => {
        const done = s.items.filter(
          (it) => state.checked[checkKey(it.chain, it.category_id)],
        ).length;
        const lis = s.items
          .map((it) => {
            const key = checkKey(it.chain, it.category_id);
            const isDone = !!state.checked[key];
            const promo = hasPromo(it);
            return `<li class="check${isDone ? " done" : ""}"><label>
              <input type="checkbox" data-check="${esc(key)}"${isDone ? " checked" : ""}><span class="box">${icon("check", 13)}</span>
              <span class="c-name"><b>${it.qty}×</b> ${esc(it.product_name)}</span>
              <span class="c-price">${promo ? `<s>${eur(it.unit_regular_price * it.qty)}</s>` : ""}<span class="${promo ? "is-promo" : ""}">${eur(it.line_total)}</span></span>
            </label></li>`;
          })
          .join("");
        return `<article class="store-card">
          <div class="store-head">${avatar(s.chain)}<div class="store-title"><h3>${esc(s.chain)}</h3><span>${countLabel(s.items.length, "продукт", "продукта")} · ${done}/${s.items.length} отметнати</span></div><strong class="store-total">${eur(s.subtotal)}</strong></div>
          <div class="progress"><i style="width:${(done / s.items.length) * 100}%"></i></div>
          <ul class="checklist">${lis}</ul>
        </article>`;
      })
      .join("");
    actions.hidden = false;
  }

  function planText() {
    const plan = currentPlan();
    if (!plan) return "";
    const lines = [`🛒 Списък за пазаруване — ${cityName()}`, ""];
    plan.stores.forEach((s) => {
      lines.push(`📍 ${s.chain} — ${eur(s.subtotal)}`);
      s.items.forEach((it) =>
        lines.push(
          `  ${state.checked[checkKey(it.chain, it.category_id)] ? "☑" : "☐"} ${it.qty}× ${it.product_name} — ${eur(it.line_total)}`,
        ),
      );
      lines.push("");
    });
    lines.push(`Общо: ${eur(plan.total)}`);
    lines.push("Данни: kolkostruva.bg (КЗП)");
    return lines.join("\n");
  }

  /* ───────────────────────── каталог: всички продукти по групи ───────────────────────── */
  async function loadCatalog() {
    if (catalog.loading) return;
    const requestId = ++catalog.requestId;
    const city = state.ekatte_code;
    catalog.loading = true;
    catalog.error = false;
    renderCatalog();

    try {
      const rows = await Data.products({ ekatte_code: city });
      if (requestId !== catalog.requestId) return;
      if (city !== state.ekatte_code) {
        catalog.loading = false;
        catalog.loaded = false;
        loadCatalog();
        return;
      }
      catalog.rows = rows;
      catalog.categoryIndex = buildCatalogIndex(rows);
      catalog.loaded = true;
    } catch (err) {
      if (requestId !== catalog.requestId) return;
      console.error("Не успяхме да заредим каталога:", err);
      catalog.error = true;
    }

    catalog.loading = false;
    renderCatalog();
  }

  function buildCatalogIndex(rows) {
    catalog.productSearchText = new WeakMap();
    const byCategory = new Map();
    rows.forEach((product) => {
      const id = Number(product.category_id);
      if (!Number.isFinite(id)) return;
      catalog.productSearchText.set(product, norm(product.name));
      if (!byCategory.has(id)) {
        byCategory.set(id, {
          id,
          name: catName(id),
          nameSearchText: norm(catName(id)),
          rows: [],
          latestDate: "",
        });
      }
      const category = byCategory.get(id);
      category.rows.push(product);
      const date = String(product.date || "");
      if (date > category.latestDate) category.latestDate = date;
    });

    return Array.from(byCategory.values()).map((category) => {
      category.rows.sort(
        (a, b) => Number(a.effective_price) - Number(b.effective_price),
      );
      category.lowest = category.rows[0] || null;
      return category;
    });
  }

  function renderCatalog() {
    const count = $("#catalog-count");
    const grid = $("#catalog-grid");
    const more = $("#catalog-more");
    const categorySelect = $("#catalog-category");

    const availableGroups = Array.from(
      new Set(catalog.categoryIndex.map((category) => catGroup(category.id))),
    ).sort((a, b) => a.localeCompare(b, "bg"));
    categorySelect.innerHTML =
      '<option value="all">Всички продуктови групи</option>' +
      availableGroups
        .map((group) => '<option value="' + esc(group) + '">' + esc(group) + "</option>")
        .join("");
    if (
      catalog.group !== "all" &&
      !availableGroups.includes(catalog.group)
    ) {
      catalog.group = "all";
    }
    categorySelect.value = catalog.group;

    if (catalog.loading) {
      count.textContent = "Зареждане на продуктите за " + cityName() + "…";
      grid.innerHTML = '<div class="skel" style="height:170px"></div>'.repeat(4);
      more.hidden = true;
      return;
    }
    if (catalog.error) {
      count.textContent = "Каталогът не можа да се зареди";
      grid.innerHTML =
        '<div class="state-inline">Не успяхме да заредим продуктите. Провери връзката с API-то и опитай отново.</div>' +
        '<button type="button" class="btn btn-soft btn-sm" data-retry-catalog>Опитай отново</button>';
      more.hidden = true;
      return;
    }

    const query = norm(catalog.query);
    const eligibleCategories = catalog.categoryIndex.filter(
      (category) =>
        catalog.group === "all" || catGroup(category.id) === catalog.group,
    );
    const categoryNameMatches = query
      ? eligibleCategories.filter((category) =>
          category.nameSearchText.includes(query),
        )
      : [];
    const groups = !query
      ? eligibleCategories
      : categoryNameMatches.length
        ? categoryNameMatches
        : eligibleCategories
            .map((category) => {
              const matchingRows = category.rows.filter((product) =>
                catalog.productSearchText.get(product)?.includes(query),
              );
              if (!matchingRows.length) return null;
              const latestDate = matchingRows.reduce((latest, product) => {
                const date = String(product.date || "");
                return date > latest ? date : latest;
              }, "");
              return {
                ...category,
                rows: matchingRows,
                lowest: matchingRows[0] || null,
                latestDate,
              };
            })
            .filter(Boolean);
    groups.sort(
      (a, b) =>
        Number(a.lowest && a.lowest.effective_price) -
        Number(b.lowest && b.lowest.effective_price),
    );

    const itemCount = groups.reduce(
      (total, category) => total + category.rows.length,
      0,
    );
    const latestDate = groups.reduce(
      (latest, category) =>
        category.latestDate > latest ? category.latestDate : latest,
      "",
    );
    count.textContent =
      groups.length +
      (groups.length === 1 ? " продуктова група" : " продуктови групи") +
      " · " +
      itemCount +
      (itemCount === 1 ? " предложение" : " предложения") +
      " · " +
      cityName() +
      (latestDate ? " · данни към " + latestDate : "");

    if (!groups.length) {
      grid.innerHTML =
        '<div class="state-inline">Няма продукти, които отговарят на търсенето.</div>';
      more.hidden = true;
      return;
    }

    const visibleGroups = groups.slice(0, catalog.shown);
    grid.innerHTML = visibleGroups
      .map((group) => {
        const low = group.lowest;
        // Only render chains with offers for this product category.
        const storeSort = catalog.storeSortByCategory.get(group.id) || "price-asc";
        const storesForGroup = Array.from(
          group.rows.reduce((byChain, product) => {
            if (!byChain.has(product.chain_name)) byChain.set(product.chain_name, []);
            byChain.get(product.chain_name).push(product);
            return byChain;
          }, new Map()),
        ).map(([chain, offers]) => {
          offers.sort(
            (a, b) => Number(a.effective_price) - Number(b.effective_price),
          );
          return { chain, offers, cheapest: Number(offers[0].effective_price) };
        });
        storesForGroup.sort((a, b) => {
          if (storeSort === "name") return a.chain.localeCompare(b.chain, "bg");
          const priceOrder = a.cheapest - b.cheapest;
          const orderedPrice = storeSort === "price-desc" ? -priceOrder : priceOrder;
          return orderedPrice || a.chain.localeCompare(b.chain, "bg");
        });
        const storesExpanded = catalog.expandedChainGroups.has(group.id);
        const visibleStores = storesExpanded
          ? storesForGroup
          : storesForGroup.slice(0, CATALOG_DEFAULT_STORES);
        const stores = visibleStores
          .map(({ chain, offers }) => {
            const expansionKey = `${group.id}:${chain}`;
            const expanded = catalog.expandedStores.has(expansionKey);
            const visibleOffers = expanded
              ? offers
              : offers.slice(0, CATALOG_DEFAULT_OFFERS);
            const offersHtml = visibleOffers
              .map((p) => {
                const regular = Number(p.regular_price) || 0;
                const current =
                  p.effective_price == null
                    ? regular
                    : Number(p.effective_price);
                const promo =
                  p.promo_price != null && Number(p.promo_price) < regular;
                const cheapest =
                  Math.abs(current - Number(low.effective_price)) < 0.000001;
                return (
                  '<article class="catalog-offer' +
                  (cheapest ? " is-cheapest" : "") +
                  '">' +
                  '<div class="catalog-offer-name">' +
                  esc(p.name) +
                  "</div>" +
                  '<div class="catalog-offer-price">' +
                  (promo ? "<s>" + eur(regular) + "</s>" : "") +
                  '<strong class="' +
                  (promo ? "is-promo" : "") +
                  '">' +
                  eur(current) +
                  "</strong>" +
                  (promo ? '<span class="catalog-promo">Промоция</span>' : "") +
                  "</div>" +
                  '<button type="button" class="btn btn-ghost btn-sm" data-hist="' +
                  esc(p.product_id) +
                  '" data-chain="' +
                  esc(p.chain_name) +
                  '" data-cat="' +
                  Number(p.category_id) +
                  '" data-name="' +
                  esc(p.name) +
                  '">История</button>' +
                  "</article>"
                );
              })
              .join("");
            const hiddenCount = offers.length - visibleOffers.length;
            const moreButton =
              hiddenCount > 0 || expanded
                ? '<button type="button" class="btn btn-ghost btn-sm catalog-offer-toggle" data-catalog-offers-toggle="' +
                  esc(expansionKey) +
                  '" aria-expanded="' +
                  String(expanded) +
                  '">' +
                  (expanded ? "Покажи по-малко" : "Покажи още (" + hiddenCount + ")") +
                  "</button>"
                : "";
            return (
              '<section class="catalog-store">' +
              '<div class="catalog-store-name"><h4>' +
              avatar(chain) +
              " " +
              esc(chain) +
              "</h4></div>" +
              '<div class="catalog-store-offers">' +
              offersHtml +
              moreButton +
              "</div>" +
              "</section>"
            );
          })
          .join("");
        const hiddenStoreCount = storesForGroup.length - visibleStores.length;
        const moreStoresButton =
          hiddenStoreCount > 0 || storesExpanded
            ? '<button type="button" class="btn btn-ghost btn-sm catalog-stores-toggle" data-catalog-stores-toggle="' +
              group.id +
              '" aria-expanded="' +
              String(storesExpanded) +
              '">' +
              (storesExpanded
                ? "Покажи по-малко магазини"
                : "Покажи още магазини (" + hiddenStoreCount + ")") +
              "</button>"
            : "";
        const chainCount = new Set(group.rows.map((p) => p.chain_name)).size;
        const collapsed = catalog.collapsedGroups.has(group.id);
        return (
          '<article class="catalog-group">' +
          '<div class="catalog-group-head">' +
          "<div><h3>" +
          esc(group.name) +
          '</h3><p class="muted">' +
          group.rows.length +
          (group.rows.length === 1 ? " предложение" : " предложения") +
          " в " +
          chainCount +
          (chainCount === 1 ? " верига" : " вериги") +
          "</p></div>" +
          '<div class="catalog-best"><span>Най-евтин вариант</span><strong>' +
          eur(low.effective_price) +
          "</strong><small>" +
          esc(low.chain_name) +
          " · " +
          esc(low.name) +
          "</small></div>" +
          '<label class="catalog-store-sort"><span>Подреди магазините</span><select data-catalog-sort-stores="' +
          group.id +
          '" aria-label="Сортирай магазините по най-ниската им цена">' +
          '<option value="price-asc"' +
          (storeSort === "price-asc" ? " selected" : "") +
          '>Най-евтините първо</option>' +
          '<option value="price-desc"' +
          (storeSort === "price-desc" ? " selected" : "") +
          '>Най-скъпите първо</option>' +
          '<option value="name"' +
          (storeSort === "name" ? " selected" : "") +
          ">По име</option></select></label>" +
          '<button type="button" class="icon-btn catalog-collapse" data-catalog-collapse="' +
          group.id +
          '" aria-controls="catalog-stores-' +
          group.id +
          '" aria-expanded="' +
          String(!collapsed) +
          '" aria-label="' +
          (collapsed ? "Разгъни предложенията" : "Свий предложенията") +
          '" title="' +
          (collapsed ? "Покажи предложенията" : "Скрий предложенията") +
          '"><span data-icon="' +
          (collapsed ? "chevron-down" : "chevron-up") +
          '" data-size="16"></span></button>' +
          '<button type="button" class="btn btn-soft btn-sm" data-add-cat="' +
          group.id +
          '"><span data-icon="plus" data-size="14"></span> В кошницата</button>' +
          "</div>" +
          '<div class="catalog-stores" id="catalog-stores-' +
          group.id +
          '"' +
          (collapsed ? " hidden" : "") +
          ">" +
          stores +
          moreStoresButton +
          "</div></article>"
        );
      })
      .join("");

    hydrateIcons(grid);
    more.hidden = groups.length <= catalog.shown;
    if (!more.hidden) {
      more.textContent =
        "Покажи още (" + (groups.length - catalog.shown) + ")";
    }
  }
  /* ───────────────────────── промоции ───────────────────────── */
  async function loadDeals() {
    const d = rt.deals;
    if (d.loading) return;
    d.loading = true;
    d.error = false;
    renderDeals();
    const city = state.ekatte_code;
    try {
      const rows = await Data.products({ ekatte_code: city, promo_only: true });
      if (city !== state.ekatte_code) {
        d.loading = false;
        loadDeals();
        return;
      }
      d.all = rows
        .filter((r) => r.promo_price != null && r.promo_price < r.regular_price)
        .map((r) => {
          const abs = r.regular_price - r.promo_price;
          return Object.assign({}, r, {
            abs,
            pct: r.regular_price ? abs / r.regular_price : 0,
            catName: catName(r.category_id),
          });
        });
      d.loaded = true;
    } catch (e) {
      console.error(e);
      d.error = true;
    }
    d.loading = false;
    renderDeals();
    verifyVisibleDeals();
  }

  function filteredDeals() {
    const d = rt.deals;
    let list = d.all;
    if (d.chain !== "all") list = list.filter((x) => x.chain_name === d.chain);
    if (d.onlyBasket) {
      const set = new Set(state.items.map((i) => i.category_id));
      list = list.filter((x) => set.has(x.category_id));
    }
    if (d.query) {
      const q = norm(d.query);
      list = list.filter((x) => norm(`${x.name} ${x.catName}`).includes(q));
    }
    list = list.slice();
    if (d.sort === "abs") list.sort((a, b) => b.abs - a.abs);
    else if (d.sort === "price")
      list.sort((a, b) => a.promo_price - b.promo_price);
    else list.sort((a, b) => b.pct - a.pct);
    return list;
  }

  function verifyBadge(st) {
    if (st === "fake") return `${icon("alert", 13)} Съмнителна промоция`;
    if (st === "ok") return `${icon("check", 13)} Без сигнал за манипулация`;
    if (st === "none") return "";
    return `<span class="muted">проверка…</span>`;
  }

  function renderDeals() {
    const d = rt.deals;
    const grid = $("#deals-grid");
    const more = $("#deals-more");
    const count = $("#deals-count");

    const names = Array.from(new Set(d.all.map((x) => x.chain_name)));
    $("#deals-chains").innerHTML = names.length
      ? `<button type="button" class="chip ${d.chain === "all" ? "on" : ""}" data-dchain="all">Всички</button>` +
        names
          .map(
            (n) =>
              `<button type="button" class="chip ${d.chain === n ? "on" : ""}" data-dchain="${esc(n)}">${avatar(n)} ${esc(n)}</button>`,
          )
          .join("")
      : "";

    if (d.loading) {
      count.textContent = "Зареждане на промоциите…";
      grid.innerHTML = Array.from(
        { length: 6 },
        () => `<div class="skel" style="height:200px"></div>`,
      ).join("");
      more.hidden = true;
      return;
    }
    if (d.error) {
      count.textContent = "Грешка при зареждане";
      grid.innerHTML = `<div class="state-inline" style="grid-column:1/-1">Не успяхме да заредим промоциите. <button type="button" class="btn btn-soft btn-sm" data-retry-deals>Опитай отново</button></div>`;
      more.hidden = true;
      return;
    }
    const list = filteredDeals();
    count.textContent = `${countLabel(list.length, "активна промоция", "активни промоции")} в ${cityName()}${list.length !== d.all.length ? ` (от ${d.all.length})` : ""}`;
    if (!list.length) {
      grid.innerHTML = `<div class="state-inline" style="grid-column:1/-1">Няма промоции, които отговарят на филтрите.</div>`;
      more.hidden = true;
      return;
    }
    const shown = list.slice(0, d.shown);
    grid.innerHTML = shown
      .map((x, i) => {
        const st = d.verified.get(x.product_id);
        return `<article class="deal" data-deal="${esc(x.product_id)}" style="animation-delay:${Math.min(i, 11) * 25}ms">
          <div class="deal-top">${avatar(x.chain_name)}<span class="deal-chain">${esc(x.chain_name)}</span><span class="deal-pct">−${Math.round(x.pct * 100)}%</span></div>
          <h3 class="deal-name">${esc(x.name)}</h3>
          <p class="deal-cat">${esc(x.catName)}</p>
          <div class="deal-price"><strong>${eur(x.promo_price)}</strong><s>${eur(x.regular_price)}</s></div>
          <div class="deal-verify" data-state="${st || "pending"}">${verifyBadge(st)}</div>
          <div class="deal-actions">
            <button type="button" class="btn btn-soft btn-sm" data-add-cat="${x.category_id}">${icon("plus", 14)} В кошницата</button>
            <button type="button" class="btn btn-ghost btn-sm" data-hist="${esc(x.product_id)}" data-chain="${esc(x.chain_name)}" data-cat="${x.category_id}" data-name="${esc(x.name)}">${icon("trend-up", 14)} История</button>
          </div>
        </article>`;
      })
      .join("");
    more.hidden = list.length <= d.shown;
    more.textContent = `Покажи още (${list.length - d.shown})`;
  }

  async function verifyVisibleDeals() {
    const d = rt.deals;
    if (!d.loaded) return;
    const todo = filteredDeals()
      .slice(0, d.shown)
      .filter((x) => !d.verified.has(x.product_id));
    await mapLimit(todo, 3, async (x) => {
      let st = "none";
      try {
        const h = await getHistory(x.product_id);
        st = h ? (h.fake_discount_warning ? "fake" : "ok") : "none";
      } catch (_) {
        return; // ще опитаме пак при следващо рисуване
      }
      d.verified.set(x.product_id, st);
      const el = $(
        `[data-deal="${CSS.escape(String(x.product_id))}"] .deal-verify`,
      );
      if (el) {
        el.dataset.state = st;
        el.innerHTML = verifyBadge(st);
      }
    });
  }

  /* ───────────────────────── история ───────────────────────── */
  let chart = null;
  const destroyChart = () => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  };

  function historySelection() {
    const h = rt.history;
    const v = rt.view;
    const cats = state.items.map((i) => i.category_id);
    let cat = h.category;
    let chain = h.chain;
    if (h.focus) {
      cat = h.focus.category_id != null ? h.focus.category_id : cat;
      chain = h.focus.chain_name;
    }
    if (cat == null || (!cats.includes(cat) && !h.focus))
      cat = cats.length ? cats[0] : null;
    const chainNames = v ? v.rk.map((r) => r.chain_name) : [];
    if (!chain || (!chainNames.includes(chain) && !h.focus))
      chain = v ? v.best.chain_name : null;
    let product = null;
    if (h.focus) {
      product = {
        product_id: h.focus.product_id,
        name: h.focus.name,
        chain_name: h.focus.chain_name,
        category_id: h.focus.category_id,
      };
    } else if (v && cat != null) {
      const it = v.table.get(cat) && v.table.get(cat).get(chain);
      if (it)
        product = {
          product_id: it.product_id,
          name: it.product_name,
          chain_name: chain,
          category_id: cat,
        };
    }
    return { cat, chain, product, cats, chainNames };
  }

  function renderHistoryControls() {
    const sel = historySelection();
    const v = rt.view;
    const h = rt.history;
    const catSel = $("#h-category");
    const cats = sel.cats.slice();
    if (sel.cat != null && !cats.includes(sel.cat)) cats.push(sel.cat);
    catSel.innerHTML = cats.length
      ? cats
          .map(
            (id) =>
              `<option value="${id}"${id === sel.cat ? " selected" : ""}>${esc(catName(id))}${sel.cats.includes(id) ? "" : " (извън кошницата)"}</option>`,
          )
          .join("")
      : `<option value="">— няма продукти в кошницата —</option>`;
    catSel.disabled = !cats.length;

    const names = sel.chainNames.slice();
    if (h.focus && !names.includes(h.focus.chain_name))
      names.push(h.focus.chain_name);
    $("#h-chains").innerHTML = names
      .map((n) => {
        const available =
          (v && v.table.get(sel.cat) && v.table.get(sel.cat).has(n)) ||
          (h.focus && h.focus.chain_name === n);
        return `<button type="button" class="chip ${n === sel.chain ? "on" : ""}" data-hchain="${esc(n)}"${available ? "" : " disabled"}>${avatar(n)} ${esc(n)}</button>`;
      })
      .join("");
    $$("#h-range [data-range]").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.range) === h.range),
      ),
    );
    $$("#h-view [data-hview]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.hview === h.view));
      if (b.dataset.hview === "all") b.disabled = !(v && v.table.get(sel.cat));
    });
  }

  function renderFocusNote(sel) {
    const el = $("#h-focus-note");
    const f = rt.history.focus;
    if (!f || sel.cats.includes(f.category_id)) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `<div class="focus-note"><span>${icon("info", 15)} Показан е продукт от промоциите: <b>${esc(f.name)}</b> · ${esc(f.chain_name)}</span>
      <span class="chips">${f.category_id != null ? `<button type="button" class="btn btn-soft btn-sm" data-add-cat="${f.category_id}">${icon("plus", 14)} Добави в кошницата</button>` : ""}<button type="button" class="btn btn-ghost btn-sm" data-clear-focus>Покажи моята кошница</button></span></div>`;
  }

  const shortDate = (iso) =>
    new Date(ts(iso)).toLocaleDateString("bg-BG", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    });
  const cssVar = (n) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function rgba(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const stat = (label, val, sub, tone) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-val">${val}</div>${sub ? `<div class="stat-sub ${tone || ""}">${sub}</div>` : ""}</div>`;

  const fakeBandPlugin = {
    id: "fakeBand",
    beforeDatasetsDraw(c, _args, opts) {
      if (!opts || opts.from == null) return;
      const { ctx, chartArea, scales } = c;
      const x0 = scales.x.getPixelForValue(opts.from);
      const x1 = scales.x.getPixelForValue(opts.to);
      ctx.save();
      ctx.fillStyle = opts.fill;
      ctx.fillRect(x0, chartArea.top, Math.max(3, x1 - x0), chartArea.height);
      ctx.fillStyle = opts.text;
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(
        opts.label,
        Math.min(x0 + 6, chartArea.right - 190),
        chartArea.top + 6,
      );
      ctx.restore();
    },
  };

  function baseChartOptions() {
    const ink = cssVar("--ink");
    const bg = cssVar("--bg");
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            color: cssVar("--ink-2"),
            font: { weight: "600", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: ink,
          titleColor: bg,
          bodyColor: bg,
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (c) =>
              c.parsed.y == null
                ? null
                : ` ${c.dataset.label}: ${eur(c.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: cssVar("--muted"), maxTicksLimit: 8, maxRotation: 0 },
        },
        y: {
          grid: { color: cssVar("--line") },
          ticks: { color: cssVar("--muted"), callback: (val) => eur(val) },
          grace: "8%",
        },
      },
    };
  }

  async function drawHistory() {
    if (!booted) return;
    const token = ++rt.histToken;
    renderHistoryControls();
    const sel = historySelection();
    const v = rt.view;
    const wrap = $("#h-chart-wrap");
    const empty = $("#h-empty");
    const stats = $("#h-stats");
    const verdict = $("#h-verdict");
    const alertEl = $("#fakeDiscountAlert");
    renderFocusNote(sel);

    const showEmpty = (html) => {
      destroyChart();
      wrap.hidden = true;
      stats.innerHTML = "";
      verdict.innerHTML = "";
      alertEl.hidden = true;
      empty.hidden = false;
      empty.innerHTML = html;
    };
    const allMode =
      rt.history.view === "all" && v && sel.cat != null && v.table.get(sel.cat);
    if (!allMode && !sel.product) {
      showEmpty(
        state.items.length
          ? "Няма данни за избрания продукт в тази верига."
          : "Добави продукти в кошницата или избери промоция, за да видиш ценовата история.",
      );
      return;
    }
    if (typeof Chart === "undefined") {
      showEmpty(
        "Графиката не може да се зареди — Chart.js (CDN) не е достъпен. Провери интернет връзката.",
      );
      return;
    }
    stats.innerHTML = `<div class="skel" style="height:66px;grid-column:1/-1"></div>`;
    const range = rt.history.range;
    Chart.defaults.font.family = '"Inter", system-ui, sans-serif';

    try {
      if (allMode) {
        const entries = Array.from(v.table.get(sel.cat).entries());
        const hs = await mapLimit(entries, 4, ([, it]) =>
          getHistory(it.product_id),
        );
        if (token !== rt.histToken) return;
        const valid = entries
          .map(([ch], i) => ({ chain: ch, h: hs[i] }))
          .filter((x) => x.h);
        if (!valid.length) {
          showEmpty("Няма история за този продукт.");
          return;
        }
        const dates = Array.from(new Set(valid.flatMap((x) => x.h.dates)))
          .sort()
          .slice(-range);
        const datasets = valid.map((x) => {
          const m = new Map(
            x.h.dates.map((d, i) => [
              d,
              x.h.promo_prices[i] != null
                ? x.h.promo_prices[i]
                : x.h.regular_prices[i],
            ]),
          );
          const col = chainColor(x.chain);
          return {
            label: x.chain,
            data: dates.map((d) => (m.has(d) ? m.get(d) : null)),
            borderColor: col,
            backgroundColor: col,
            borderWidth: 2.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            stepped: "before",
            spanGaps: true,
          };
        });
        const now = valid
          .map((x) => {
            const n = x.h.dates.length - 1;
            const promo = x.h.promo_prices[n] != null;
            return {
              chain: x.chain,
              cur: promo ? x.h.promo_prices[n] : x.h.regular_prices[n],
              promo,
            };
          })
          .sort((a, b) => a.cur - b.cur);
        stats.innerHTML = now
          .map((n, i) =>
            stat(
              esc(n.chain),
              eur(n.cur),
              n.promo ? "промоция" : "базова цена",
              i === 0 ? "good" : "",
            ),
          )
          .join("");
        verdict.innerHTML = "";
        alertEl.hidden = true;
        empty.hidden = true;
        wrap.hidden = false;
        destroyChart();
        chart = new Chart($("#priceHistoryChart"), {
          type: "line",
          data: { labels: dates.map(shortDate), datasets },
          options: baseChartOptions(),
        });
        return;
      }

      const h = await getHistory(sel.product.product_id);
      if (token !== rt.histToken) return;
      if (!h) {
        showEmpty(
          "Няма ценова история за този продукт в избраното населено място.",
        );
        return;
      }
      const a = analyzeHistory(h, range);
      const idx = [];
      for (let i = a.start; i < a.n; i++) idx.push(i);

      stats.innerHTML =
        stat(
          "Сега",
          eur(a.cur),
          a.promoActive ? `промоция −${pct0(a.adv)}` : "базова цена",
          a.promoActive ? "good" : "",
        ) +
        stat("Базова цена", eur(a.regNow)) +
        stat(`Най-ниска · ${range} дни`, eur(a.min)) +
        stat(
          "Средна",
          eur(a.avg),
          `${fmtPct(a.vsAvg)} спрямо средната`,
          a.vsAvg < -0.005 ? "good" : a.vsAvg > 0.005 ? "bad" : "",
        ) +
        stat("Най-висока", eur(a.max));

      if (h.fake_discount_warning) {
        alertEl.hidden = false;
        $("#fakeDiscountText").textContent = a.hike
          ? `Във верига ${h.chain_name} базовата цена на „${h.product_name}“ е била повишена от ${eur(a.hike.from)} на ${eur(a.hike.to)} през 7-те дни преди началото на промоцията (${eur(a.promoNow)}).`
          : `Във верига ${h.chain_name} е засечено повишение на базовата цена на „${h.product_name}“ непосредствено преди промоцията.`;
      } else {
        alertEl.hidden = true;
      }

      const vd = verdictFor(h, a);
      verdict.innerHTML = `<div class="verdict ${vd.tone}">${icon(vd.tone === "good" ? "check" : vd.tone === "warn" ? "alert" : "info", 20)}<div><strong>${esc(vd.title)}</strong><p>${esc(vd.text)}</p></div></div>`;

      const accent = cssVar("--accent");
      const warn = cssVar("--warn");
      let band = {};
      if (h.fake_discount_warning && a.hike) {
        band = {
          from: Math.max(0, a.hike.fromIdx - a.start),
          to: Math.max(0, a.hike.toIdx - a.start),
          fill: rgba(
            warn.startsWith("#") && warn.length === 7 ? warn : "#f59e0b",
            0.16,
          ),
          text: warn,
          label: "Повишение преди промоцията",
        };
      }
      const opts = baseChartOptions();
      opts.plugins.fakeBand = band;
      empty.hidden = true;
      wrap.hidden = false;
      destroyChart();
      chart = new Chart($("#priceHistoryChart"), {
        type: "line",
        data: {
          labels: idx.map((i) => shortDate(h.dates[i])),
          datasets: [
            {
              label: "Базова цена",
              data: idx.map((i) => h.regular_prices[i]),
              borderColor: cssVar("--muted"),
              borderDash: [6, 4],
              borderWidth: 2,
              stepped: "before",
              pointRadius: 0,
              pointHoverRadius: 4,
            },
            {
              label: "Промоционална цена",
              data: idx.map((i) => h.promo_prices[i]),
              borderColor: accent,
              backgroundColor: rgba(
                accent.length === 7 ? accent : "#10b981",
                0.18,
              ),
              borderWidth: 3,
              stepped: "before",
              pointRadius: 2.5,
              pointBackgroundColor: accent,
              fill: "-1",
              spanGaps: false,
            },
          ],
        },
        options: opts,
        plugins: [fakeBandPlugin],
      });
    } catch (e) {
      console.error(e);
      if (token === rt.histToken)
        showEmpty("Грешка при зареждане на историята.");
    }
  }

  function openHistory(t) {
    rt.history.focus = {
      product_id: t.product_id,
      chain_name: t.chain_name,
      name: t.name,
      category_id: t.category_id,
    };
    rt.history.view = "single";
    rt.history.category = t.category_id;
    rt.history.chain = t.chain_name;
    closeDrawer();
    setTab("history");
  }

  /* ───────────────────────── кошници: шаблони и запазени ───────────────────────── */
  function renderBasketsDialog() {
    const saved = state.saved;
    $("#saved-list").innerHTML = saved.length
      ? saved
          .map(
            (
              b,
            ) => `<li class="saved-item" data-saved="${esc(b.id)}"><div class="si-main"><b>${esc(b.name)}</b><small>${countLabel(b.items.length, "продукт", "продукта")}${(rt.settlementByCode.get(b.ekatte_code) || {}).name ? " · " + esc(rt.settlementByCode.get(b.ekatte_code).name) : ""}</small></div>
          <button type="button" class="btn btn-soft btn-sm" data-load-saved="${esc(b.id)}">Зареди</button>
          <button type="button" class="icon-btn sm danger" data-del-saved="${esc(b.id)}" aria-label="Изтрий ${esc(b.name)}">${icon("trash", 14)}</button></li>`,
          )
          .join("")
      : `<li class="muted">Още нямаш запазени кошници. Въведи име по-горе и натисни „Запази“.</li>`;
    $("#template-grid").innerHTML = TEMPLATES.map((t) => {
      const n = t.items.filter(([id]) => rt.catById.has(id)).length;
      if (n < 2) return "";
      return `<button type="button" class="template-card" data-template="${t.id}"><span class="tc-emoji">${t.emoji}</span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small><small class="tc-count">${countLabel(n, "продукт", "продукта")}</small></button>`;
    }).join("");
  }
  function openBaskets() {
    renderBasketsDialog();
    const d = $("#baskets-dialog");
    if (d.showModal) {
      if (!d.open) d.showModal();
    } else d.setAttribute("open", "");
  }
  function closeBaskets() {
    const d = $("#baskets-dialog");
    if (d.close) d.close();
    else d.removeAttribute("open");
  }
  function loadTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    replaceBasket(
      t.items.map(([c, q]) => ({ category_id: c, qty: q })),
      `Заредена кошница: ${t.name}`,
    );
    closeBaskets();
    setTab("compare");
  }

  /* ───────────────────────── споделяне, експорт ───────────────────────── */
  function shareUrl() {
    const base = location.href.split("#")[0];
    return `${base}#b=${state.items.map((i) => `${i.category_id}.${i.qty}`).join(",")}&c=${encodeURIComponent(state.ekatte_code)}&p=${state.include_promos ? 1 : 0}`;
  }
  async function shareBasket() {
    if (!state.items.length) {
      toast("Добави продукти, за да споделиш кошницата.");
      return;
    }
    const ok = await copyText(shareUrl());
    toast(
      ok ? "Линкът към кошницата е копиран" : "Не успяхме да копираме линка",
      ok ? {} : { type: "warn" },
    );
  }
  function applyHashState() {
    const raw = location.hash.replace(/^#/, "");
    if (!/(^|&)b=/.test(raw)) return;
    const p = new URLSearchParams(raw);
    const items = [];
    (p.get("b") || "").split(",").forEach((tok) => {
      const [id, q] = tok.split(".");
      const cid = Number(id);
      if (Number.isFinite(cid) && tok)
        items.push({ category_id: cid, qty: parseInt(q || "1", 10) || 1 });
    });
    const clean = cleanItems(items);
    if (!clean.length) return;
    state.items = clean;
    if (p.get("c")) state.ekatte_code = p.get("c");
    if (p.has("p")) state.include_promos = p.get("p") !== "0";
    saveState();
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (_) {
      /* file:// */
    }
    rt.sharedLoaded = true;
  }
  function exportCsv() {
    const v = rt.view;
    if (!v) return;
    const cols = v.rk.map((r) => r.chain_name);
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const num = (n) => Number(n).toFixed(2).replace(".", ",");
    const rows = [["Продукт", "Количество"].concat(cols).map(q).join(";")];
    state.items.forEach((i) => {
      const byChain = v.table.get(i.category_id);
      if (!byChain) return;
      rows.push(
        [q(catName(i.category_id)), i.qty]
          .concat(
            cols.map((c) =>
              byChain.get(c) ? num(byChain.get(c).line_total) : "",
            ),
          )
          .join(";"),
      );
    });
    rows.push(
      [q("ОБЩО"), ""].concat(v.rk.map((r) => num(r.total_cost))).join(";"),
    );
    const blob = new Blob(["\ufeff" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kolko-struva-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("CSV файлът е изтеглен");
  }

  /* ───────────────────────── табове, drawer ───────────────────────── */
  function setTab(name, opts = {}) {
    if (!["compare", "catalog", "plan", "deals", "history"].includes(name))
      name = "compare";
    state.tab = name;
    saveState();
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$(".view").forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });
    if (!booted) return;
    if (name === "deals") {
      if (!rt.deals.loaded && !rt.deals.loading) loadDeals();
      else {
        renderDeals();
        verifyVisibleDeals();
      }
    }
    if (name === "catalog") {
      if (!catalog.loaded && !catalog.loading) loadCatalog();
      else renderCatalog();
    }
    if (name === "history") drawHistory();
    if (name === "plan") renderPlan();
    if (!opts.noScroll) {
      const top = $("#main").getBoundingClientRect().top + window.scrollY - 76;
      if (window.scrollY > top + 40)
        window.scrollTo({ top, behavior: REDUCED ? "auto" : "smooth" });
    }
  }
  function openDrawer() {
    document.body.classList.add("drawer-open");
    $("#mobile-open").setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    const b = $("#mobile-open");
    if (b) b.setAttribute("aria-expanded", "false");
  }
  function focusSearch() {
    if (mobileMQ.matches) openDrawer();
    setTimeout(() => $("#add-input").focus(), mobileMQ.matches ? 80 : 0);
  }

  /* ───────────────────────── синхронизация на контролите ───────────────────────── */
  function syncControls() {
    $("#city-input").value = cityName();
    $("#promo-toggle").checked = state.include_promos;
    $("#budget-input").value = state.budget ? String(state.budget) : "";
    $("#deals-sort").value = rt.deals.sort;
    $("#deals-only-basket").checked = rt.deals.onlyBasket;
  }

  async function reconnect() {
    const btn = $("#api-status");
    btn.disabled = true;
    $("#api-status-text").textContent = "Свързване…";
    const wasLive = rt.mode === "live";
    const ok = await connect();
    btn.disabled = false;
    if (ok) {
      sanitizeState({ items: true });
      syncControls();
      rt.deals.loaded = false;
      rt.deals.all = [];
      rt.deals.verified.clear();
      catalog.loaded = false;
      catalog.rows = [];
      catalog.categoryIndex = [];
      if (state.tab === "catalog") loadCatalog();
      toast(
        wasLive
          ? "Връзката с API-то е наред"
          : "Свързано с API-то — зареждаме реални цени",
      );
      updateStatus();
      renderBasket();
      await refresh();
      if (state.tab === "deals") loadDeals();
    } else {
      updateStatus();
      toast(
        wasLive
          ? "Връзката с API-то е нестабилна"
          : "Няма връзка с API-то. Остават демо данните.",
        { type: "warn" },
      );
    }
  }

  hooks.offline = () => {
    updateStatus();
    syncControls();
    renderBasket();
    rt.deals.loaded = false;
    toast("Няма връзка с API-то — показваме демо данни.", {
      type: "warn",
      action: { label: "Опитай пак", fn: reconnect },
    });
  };

  /* ───────────────────────── събития ───────────────────────── */
  function bindEvents() {
    /* табове */
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (b) setTab(b.dataset.tab);
    });
    $("#tabs").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = $$(".tab");
      const i = tabs.findIndex(
        (t) => t.getAttribute("aria-selected") === "true",
      );
      const next =
        tabs[
          (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length
        ];
      next.focus();
      setTab(next.dataset.tab, { noScroll: true });
    });

    /* глобални действия */
    document.addEventListener("click", (e) => {
      const t = e.target;
      let el;
      if ((el = t.closest("[data-goto]"))) return setTab(el.dataset.goto);
      if (t.closest("[data-open-baskets]")) return openBaskets();
      if ((el = t.closest("[data-template]")))
        return loadTemplate(el.dataset.template);
      if ((el = t.closest("[data-hist]"))) {
        return openHistory({
          product_id: el.dataset.hist,
          chain_name: el.dataset.chain,
          name: el.dataset.name,
          category_id: el.dataset.cat ? Number(el.dataset.cat) : null,
        });
      }
      if ((el = t.closest("[data-catalog-offers-toggle]"))) {
        const key = el.dataset.catalogOffersToggle;
        if (catalog.expandedStores.has(key)) catalog.expandedStores.delete(key);
        else catalog.expandedStores.add(key);
        return renderCatalog();
      }
      if ((el = t.closest("[data-catalog-stores-toggle]"))) {
        const id = Number(el.dataset.catalogStoresToggle);
        if (catalog.expandedChainGroups.has(id)) catalog.expandedChainGroups.delete(id);
        else catalog.expandedChainGroups.add(id);
        return renderCatalog();
      }
      if ((el = t.closest("[data-catalog-collapse]"))) {
        const id = Number(el.dataset.catalogCollapse);
        if (catalog.collapsedGroups.has(id)) catalog.collapsedGroups.delete(id);
        else catalog.collapsedGroups.add(id);
        return renderCatalog();
      }
      if ((el = t.closest("[data-quick]")))
        return addCategory(Number(el.dataset.quick));
      if ((el = t.closest("[data-add-cat]"))) {
        addCategory(Number(el.dataset.addCat));
        if (state.tab === "history") drawHistory();
        return;
      }
      if (t.closest("[data-retry]")) return refresh();
      if (t.closest("[data-retry-catalog]")) return loadCatalog();      if (t.closest("[data-retry-deals]")) return loadDeals();
      if ((el = t.closest("[data-remove-cat]")))
        return removeItem(Number(el.dataset.removeCat));
      if (t.closest("[data-focus-search]")) return focusSearch();
      if (t.closest("[data-clear-focus]")) {
        rt.history.focus = null;
        return drawHistory();
      }
    });

    /* кошница */
    $("#basket-items").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = Number(btn.closest("[data-cat]").dataset.cat);
      if (btn.dataset.act === "inc") changeQty(id, 1);
      else if (btn.dataset.act === "dec") changeQty(id, -1);
      else removeItem(id);
    });
    $("#promo-toggle").addEventListener("change", (e) => {
      state.include_promos = e.target.checked;
      saveState();
      scheduleRefresh(0);
    });
    $("#budget-input").addEventListener("input", (e) => {
      const n = parseFloat(String(e.target.value).replace(",", "."));
      state.budget = n > 0 ? n : null;
      saveState();
      renderBudget();
      if (rt.view) renderCompare();
    });
    $("#reset-basket-btn").addEventListener("click", clearBasket);
    $("#share-basket").addEventListener("click", shareBasket);
    $("#open-baskets").addEventListener("click", openBaskets);
    $("#open-search").addEventListener("click", focusSearch);

    /* drawer */
    $("#mobile-open").addEventListener("click", () =>
      document.body.classList.contains("drawer-open")
        ? closeDrawer()
        : openDrawer(),
    );
    $("#close-drawer").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);
    const onMq = () => {
      if (!mobileMQ.matches) closeDrawer();
    };
    if (mobileMQ.addEventListener) mobileMQ.addEventListener("change", onMq);

    /* тема и статус */
    $("#theme-toggle").addEventListener("click", cycleTheme);
    $("#api-status").addEventListener("click", reconnect);
    if (darkMQ && darkMQ.addEventListener)
      darkMQ.addEventListener(
        "change",
        () => themeMode === "system" && applyTheme(),
      );

    /* сравнение */
    $("#rank-seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rank]");
      if (!b) return;
      rt.rankView = b.dataset.rank;
      renderCompare();
    });
    $("#chain-filter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-chain]");
      if (!b || b.disabled) return;
      const name = b.dataset.chain;
      const ex = new Set(state.excluded_chains);
      if (ex.has(name)) ex.delete(name);
      else {
        const visible = rt.result.rankings.filter(
          (r) => !ex.has(r.chain_name),
        ).length;
        if (visible <= 1) {
          toast("Поне една верига трябва да остане видима", { type: "warn" });
          return;
        }
        ex.add(name);
      }
      state.excluded_chains = Array.from(ex);
      saveState();
      renderAll();
      loadTrend();
    });
    $("#store-results").addEventListener(
      "toggle",
      (e) => {
        if (!e.target.matches || !e.target.matches("details.rank")) return;
        rt.openTouched = true;
        rt.openChains = new Set(
          $$("details.rank[open]", $("#store-results")).map(
            (d) => d.dataset.chain,
          ),
        );
      },
      true,
    );
    $("#export-csv").addEventListener("click", exportCsv);

    /* план */
    $("#plan-opts").addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (!b) return;
      state.max_stores = Number(b.dataset.k);
      saveState();
      renderPlan();
    });
    $("#plan-lists").addEventListener("change", (e) => {
      const cb = e.target.closest("[data-check]");
      if (!cb) return;
      if (cb.checked) state.checked[cb.dataset.check] = true;
      else delete state.checked[cb.dataset.check];
      saveState();
      renderPlan();
    });
    $("#plan-copy").addEventListener("click", async () => {
      const ok = await copyText(planText());
      toast(
        ok
          ? "Списъкът е копиран — постави го в съобщение"
          : "Не успяхме да копираме списъка",
        ok ? {} : { type: "warn" },
      );
    });
    $("#plan-print").addEventListener("click", () => window.print());
    $("#plan-reset").addEventListener("click", () => {
      state.checked = {};
      saveState();
      renderPlan();
    });

    /* промоции */
    let dealsTimer = null;
    $("#deals-q").addEventListener("input", (e) => {
      clearTimeout(dealsTimer);
      dealsTimer = setTimeout(() => {
        rt.deals.query = e.target.value.trim();
        rt.deals.shown = 12;
        renderDeals();
        verifyVisibleDeals();
      }, 180);
    });
    $("#deals-sort").addEventListener("change", (e) => {
      rt.deals.sort = e.target.value;
      rt.deals.shown = 12;
      renderDeals();
      verifyVisibleDeals();
    });
    $("#deals-only-basket").addEventListener("change", (e) => {
      rt.deals.onlyBasket = e.target.checked;
      rt.deals.shown = 12;
      renderDeals();
      verifyVisibleDeals();
    });
    $("#deals-chains").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dchain]");
      if (!b) return;
      rt.deals.chain = b.dataset.dchain;
      rt.deals.shown = 12;
      renderDeals();
      verifyVisibleDeals();
    });
    $("#deals-more").addEventListener("click", () => {
      rt.deals.shown += 12;
      renderDeals();
      verifyVisibleDeals();
    });

    /* продуктов каталог */
    let catalogTimer = null;
    $("#catalog-q").addEventListener("input", (e) => {
      clearTimeout(catalogTimer);
      catalogTimer = setTimeout(() => {
        catalog.query = e.target.value.trim();
        catalog.shown = 12;
        renderCatalog();
      }, 240);
    });
    $("#catalog-category").addEventListener("change", (e) => {
      catalog.group = e.target.value;
      catalog.shown = 12;
      renderCatalog();
    });
    $("#catalog-more").addEventListener("click", () => {
      catalog.shown += 12;
      renderCatalog();
    });
    $("#catalog-grid").addEventListener("change", (e) => {
      const select = e.target.closest("[data-catalog-sort-stores]");
      if (!select) return;
      catalog.storeSortByCategory.set(
        Number(select.dataset.catalogSortStores),
        select.value,
      );
      renderCatalog();
    });
    /* история */
    $("#h-category").addEventListener("change", (e) => {
      rt.history.focus = null;
      rt.history.category = Number(e.target.value);
      drawHistory();
    });
    $("#h-chains").addEventListener("click", (e) => {
      const b = e.target.closest("[data-hchain]");
      if (!b || b.disabled) return;
      if (rt.history.focus && rt.history.focus.chain_name !== b.dataset.hchain)
        rt.history.focus = null;
      rt.history.chain = b.dataset.hchain;
      drawHistory();
    });
    $("#h-range").addEventListener("click", (e) => {
      const b = e.target.closest("[data-range]");
      if (!b) return;
      rt.history.range = Number(b.dataset.range);
      drawHistory();
    });
    $("#h-view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-hview]");
      if (!b || b.disabled) return;
      rt.history.view = b.dataset.hview;
      if (rt.history.view === "all") rt.history.focus = null;
      drawHistory();
    });

    /* диалог */
    $("#dialog-close").addEventListener("click", closeBaskets);
    $("#baskets-dialog").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeBaskets();
    });
    $("#save-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#save-name").value.trim();
      if (!name) return;
      if (!state.items.length) {
        toast("Кошницата е празна — няма какво да се запази", { type: "warn" });
        return;
      }
      state.saved.unshift({
        id: Math.random().toString(36).slice(2, 10),
        name,
        ekatte_code: state.ekatte_code,
        include_promos: state.include_promos,
        items: clone(state.items),
        created: Date.now(),
      });
      state.saved = state.saved.slice(0, 20);
      saveState();
      $("#save-name").value = "";
      renderBasketsDialog();
      toast(`Запазена: ${name}`);
    });
    $("#saved-list").addEventListener("click", (e) => {
      const load = e.target.closest("[data-load-saved]");
      const del = e.target.closest("[data-del-saved]");
      if (load) {
        const b = state.saved.find((x) => x.id === load.dataset.loadSaved);
        if (!b) return;
        if (b.ekatte_code && rt.settlementByCode.has(b.ekatte_code))
          setCity(b.ekatte_code, { silent: true });
        if (typeof b.include_promos === "boolean") {
          state.include_promos = b.include_promos;
          $("#promo-toggle").checked = b.include_promos;
        }
        replaceBasket(b.items, `Заредена: ${b.name}`);
        closeBaskets();
        setTab("compare");
      } else if (del) {
        state.saved = state.saved.filter((x) => x.id !== del.dataset.delSaved);
        saveState();
        renderBasketsDialog();
      }
    });

    /* клавиатура */
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toUpperCase();
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target.isContentEditable;
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !typing)
      ) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "Escape") {
        closeDrawer();
      }
    });
  }

  function initCombos() {
    const cityInput = $("#city-input");
    createCombo({
      input: cityInput,
      list: $("#city-list"),
      getOptions: cityOptions,
      onPick: (o) => {
        setCity(o.value.code);
        cityInput.value = cityName();
        cityInput.blur();
      },
    });
    cityInput.addEventListener("blur", () => {
      setTimeout(() => {
        cityInput.value = cityName();
      }, 140);
    });
    const addInput = $("#add-input");
    createCombo({
      input: addInput,
      list: $("#add-list"),
      keepOpen: true,
      getOptions: categoryOptions,
      onPick: (o) => {
        addCategory(o.value.id, 1, { silent: true });
        addInput.value = "";
      },
    });
  }

  /* ───────────────────────── старт ───────────────────────── */
  async function boot() {
    hydrateIcons(document);
    applyTheme();
    bindEvents();
    setTab(state.tab, { noScroll: true });
    $("#hero").innerHTML = `<div class="skel skel-hero"></div>`;

    // 1) опит за връзка с API-то, иначе демо
    const live = await connect();
    if (!live) SB.useDemo(false);
    applyHashState();
    sanitizeState({ items: true });
    initCombos();
    syncControls();
    updateStatus();
    booted = true;
    renderBasket();
    if (rt.sharedLoaded) toast("Заредена е споделена кошница");
    else if (!live)
      toast(
        "Показваме демо данни — стартирай бекенда, за да видиш реални цени.",
        { type: "warn" },
      );
    await refresh();
    if (state.tab === "catalog") loadCatalog();
    if (state.tab === "deals") loadDeals();
    if (state.tab === "history") drawHistory();
  }

  boot().catch((err) => {
    console.error(err);
    const hero = $("#hero");
    if (hero)
      hero.innerHTML = `<div class="state-card warn"><div class="state-ic">${icon("alert", 30)}</div><h3>Нещо се обърка при стартирането</h3><p>${esc(err && err.message)}</p></div>`;
  });
})();
