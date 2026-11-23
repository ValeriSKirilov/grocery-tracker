/* ==========================================================================
   core.js — състояние, слой за данни (live API + демо), нормализация на вериги,
   динамично разпознаване на категории и аналитика.
   Няма DOM код. Излага всичко през window.SB.
   ========================================================================== */
(() => {
  "use strict";

  const DEMO = window.SmartBasketDemo;
  const API = String(
    window.SMARTBASKET_API_BASE || "http://localhost:8000/api/v1",
  ).replace(/\/$/, "");
  const REQUEST_TIMEOUT = 15000;
  const STORAGE_KEY = "smartbasket_state_v3";
  const LEGACY_KEYS = ["smartbasket_state_v2", "smartbasket_state_v1"];
  const DAY = 86400000;
  const MAX_BUDGET = 100000;

  /* ───────────────────────── helpers ───────────────────────── */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const norm = (s) =>
    String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[„“"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
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

  /* ───────────────────────── чисти имена и уникални цветове на вериги ───────────────────────── */
  const wordRe = (pattern) =>
    new RegExp(
      `(?:^|[^\\p{L}\\p{N}])(?:${pattern})(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    );
  const stripWordRe = (pattern) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])(?:${pattern})(?=$|[^\\p{L}\\p{N}])`, "giu");

  const KNOWN_BRANDS = [
    { re: wordRe("lidl|лидл"), name: "Лидл", color: "#0284c7" },
    { re: wordRe("kaufland|кауфланд"), name: "Кауфланд", color: "#dc2626" },
    { re: wordRe("billa|билла|била"), name: "Билла", color: "#d97706" },
    {
      re: wordRe("fantastico|фантастико"),
      name: "Фантастико",
      color: "#e11d48",
    },
    {
      re: wordRe("t\\s*-?\\s*market|т\\s*-?\\s*маркет|максима\\s+българия"),
      name: "T Market",
      color: "#16a34a",
    },
    {
      re: wordRe("hit\\s*max|хит\\s*макс|хит\\s*хипермаркет"),
      name: "Хит Макс",
      color: "#7c3aed",
    },
    { re: wordRe("metro|метро"), name: "Метро", color: "#1d4ed8" },
    { re: wordRe("kam|кам"), name: "KAM", color: "#ea580c" },
    { re: wordRe("cba|цба"), name: "CBA", color: "#0d9488" },
    { re: wordRe("магазин\\s+дар|дар"), name: "Магазин Дар", color: "#9333ea" },
    { re: wordRe("bulmag|булмаг"), name: "Булмаг", color: "#2563eb" },
    { re: wordRe("lexi|лекси"), name: "Лекси", color: "#db2777" },
    { re: wordRe("promarket|промаркет"), name: "Промаркет", color: "#059669" },
    {
      re: wordRe("mini\\s*mart|мини\\s*март"),
      name: "Мини Март",
      color: "#65a30d",
    },
    { re: wordRe("burlex|бурлекс"), name: "Бурлекс", color: "#0891b2" },
    { re: wordRe("lilly|лили"), name: "Лили Дрогерие", color: "#c026d3" },
    {
      re: wordRe("dm\\s+българия|dm|дм\\s+българия"),
      name: "dm",
      color: "#4f46e5",
    },
    { re: wordRe("жанет|zhanet"), name: "Жанет", color: "#ca8a04" },
    { re: wordRe("аванти|avanti"), name: "Аванти", color: "#be123c" },
    { re: wordRe("триумф|triumf"), name: "Триумф", color: "#15803d" },
    { re: wordRe("хелиос|helios"), name: "Хелиос", color: "#b45309" },
  ];

  // 18 висококонтрастни, ясно различими цвята за графики и аватари
  const CHART_PALETTE = [
    "#0284c7", // sky blue
    "#dc2626", // crimson red
    "#059669", // emerald
    "#d97706", // amber
    "#7c3aed", // violet
    "#e11d48", // rose
    "#0d9488", // teal
    "#ea580c", // orange
    "#2563eb", // royal blue
    "#65a30d", // lime
    "#c026d3", // fuchsia
    "#0891b2", // cyan
    "#4f46e5", // indigo
    "#b45309", // ochre
    "#db2777", // pink
    "#15803d", // forest green
    "#9333ea", // purple
    "#475569", // slate
  ];

  const LEGAL_SUFFIX_RE = stripWordRe(
    "еоод|оод|ад|еад|ет|сд|кд|енд\\s+ко(?:\\s+кд)?|българия|трейд|груп|маркет\\s+българия|кеш\\s+енд\\s+кери",
  );

  function toTitleCaseBg(str) {
    return str
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        if (
          /^[A-ZА-Я]{2,3}$/.test(w) &&
          !/^(НА|ЗА|ОТ|ДО|ПО|ВЪВ|СЪС)$/.test(w)
        ) {
          return w; // кратки абревиатури като CBA, KAM, DM
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function extractBaseBrand(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    // В демо режим пазим кратките имена като "Billa", "Lidl" и т.н.
    if (rt.mode === "demo" && s.length <= 16 && !/[()]/.test(s)) return s;

    for (const b of KNOWN_BRANDS) {
      if (b.name && b.re.test(s)) return b.name;
    }
    let cleaned = s
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/[„“"']/g, "")
      .replace(LEGAL_SUFFIX_RE, "$1")
      .replace(/[-–—,\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) cleaned = s;
    const upperRatio =
      (cleaned.match(/[A-ZА-Я]/g) || []).length /
      Math.max(1, cleaned.replace(/[^A-Za-zА-Яа-я]/g, "").length);
    if (upperRatio > 0.7 && cleaned.length > 3) {
      cleaned = toTitleCaseBg(cleaned);
    }
    return cleaned;
  }

  function extractShortQualifier(raw) {
    const m = /\(([^)]+)\)/.exec(String(raw || ""));
    if (!m) return "";
    let inner = m[1]
      .replace(/[„“"']/g, "")
      .replace(LEGAL_SUFFIX_RE, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!inner) return "";
    const words = inner.split(/\s+/).slice(0, 2).join(" ");
    return toTitleCaseBg(words);
  }

  function rebuildChainVisuals(chainNames) {
    const all = Array.from(new Set((chainNames || []).filter(Boolean)));
    const baseByRaw = new Map();
    const counts = new Map();
    all.forEach((raw) => {
      const base = extractBaseBrand(raw);
      baseByRaw.set(raw, base);
      counts.set(base, (counts.get(base) || 0) + 1);
    });

    const displayMap = new Map();
    all.forEach((raw) => {
      const base = baseByRaw.get(raw);
      if (counts.get(base) > 1) {
        const qual = extractShortQualifier(raw);
        if (qual && norm(qual) !== norm(base)) {
          displayMap.set(raw, `${base} · ${qual}`);
          return;
        }
      }
      displayMap.set(raw, base);
    });
    rt.chainDisplay = displayMap;

    // Уникални цветове без повторения
    const used = new Set();
    const colorMap = new Map();
    // Първо пас: известни брандове
    all.forEach((raw) => {
      for (const b of KNOWN_BRANDS) {
        if (b.color && b.re.test(raw) && !used.has(b.color)) {
          colorMap.set(raw, b.color);
          used.add(b.color);
          return;
        }
      }
    });
    // Втори пас: останалите получават неизползвани цветове от палитрата
    let palIdx = 0;
    let extraIdx = 0;
    all.forEach((raw) => {
      if (colorMap.has(raw)) return;
      while (palIdx < CHART_PALETTE.length && used.has(CHART_PALETTE[palIdx])) {
        palIdx++;
      }
      if (palIdx < CHART_PALETTE.length) {
        const col = CHART_PALETTE[palIdx++];
        colorMap.set(raw, col);
        used.add(col);
      } else {
        // Golden-angle HSL за >18 вериги — гарантирано различни
        const hue = Math.round((extraIdx++ * 137.508 + 25) % 360);
        colorMap.set(raw, `hsl(${hue}, 70%, 44%)`);
      }
    });
    rt.chainColors = colorMap;
  }

  function displayChain(raw) {
    const key = String(raw || "");
    if (!key) return "";
    if (rt.chainDisplay.has(key)) return rt.chainDisplay.get(key);
    const cleaned = extractBaseBrand(key);
    rt.chainDisplay.set(key, cleaned);
    return cleaned;
  }

  function chainColor(raw) {
    const key = String(raw || "");
    if (rt.chainColors.has(key)) return rt.chainColors.get(key);
    // Регистрираме динамично нов цвят без да дублираме вече заети
    const used = new Set(rt.chainColors.values());
    for (const b of KNOWN_BRANDS) {
      if (b.color && b.re.test(key) && !used.has(b.color)) {
        rt.chainColors.set(key, b.color);
        return b.color;
      }
    }
    for (const col of CHART_PALETTE) {
      if (!used.has(col)) {
        rt.chainColors.set(key, col);
        return col;
      }
    }
    const hue = Math.round(((rt.chainColors.size + 1) * 137.508 + 25) % 360);
    const col = `hsl(${hue}, 70%, 44%)`;
    rt.chainColors.set(key, col);
    return col;
  }

  function smartShortName(cat) {
    if (!cat) return "";
    if (cat.short) return cat.short;
    let s = String(cat.name || "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(
        stripWordRe(
          "от\\s+\\d+\\s*(?:бр\\.?|г\\.?|гр\\.?|кг\\.?|мл\\.?|л\\.?)\\s+до\\s+\\d+\\s*(?:бр\\.?|г\\.?|гр\\.?|кг\\.?|мл\\.?|л\\.?)",
        ),
        "$1",
      )
      .replace(stripWordRe("(?:подово|клетъчно|свободно)\\s+отглеждане"), "$1")
      .replace(stripWordRe("размер\\s+[smlмl/]+"), "$1")
      .replace(stripWordRe("бяло\\s+саламурено"), "$1")
      .replace(stripWordRe("охладен[оаи]?"), "$1")
      .replace(stripWordRe("нарязан[оаи]?"), "$1")
      .replace(
        /(^|[^\p{L}\p{N}])прясн[оаи]\s+(?=(?:свинск|пилешк|телешк|домат|краставиц))/giu,
        "$1",
      )
      .replace(/[.,;:\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length > 24) {
      s = s.slice(0, 23).replace(/\s+\S*$/, "") + "…";
    }
    return s || cat.name;
  }

  /* ───────────────────────── динамични категории и реалистични кошници ───────────────────────── */
  const STAPLE_SPECS = {
    freshMilk: {
      demoId: 12,
      matchers: [
        {
          all: ["прясно мляко"],
          not: [
            "соев",
            "овесен",
            "бадемов",
            "кокосов",
            "кондензир",
            "сухо",
            "козе",
            "овче",
          ],
        },
        { all: ["мляко", "прясно"], not: ["кисел", "соев", "сухо"] },
      ],
    },
    yogurt: {
      demoId: 15,
      matchers: [
        {
          all: ["кисело мляко"],
          not: ["козе", "овче", "биволск", "плодов", "айрян", "протеин"],
        },
        { all: ["кисело", "мляко"], not: ["плодов", "айрян"] },
      ],
    },
    eggs: {
      demoId: 20,
      matchers: [
        { all: ["яйца"], not: ["пъдпъд", "шоколад", "велигд", "боя"] },
      ],
    },
    whiteBread: {
      demoId: 1,
      matchers: [
        { all: ["бял хляб"], not: ["сухар", "галет", "безглутен"] },
        { all: ["хляб", "добруджа"], not: ["сухар"] },
        { all: ["хляб"], not: ["сухар", "галет", "безглутен", "козунак"] },
      ],
    },
    cheese: {
      demoId: 18,
      matchers: [
        {
          all: ["краве сирене"],
          not: ["топен", "крем", "пушен", "козе", "овче"],
        },
        { all: ["сирене", "краве"], not: ["топен", "крем"] },
        { all: ["бяло", "сирене"], not: ["козе", "овче"] },
        { all: ["сирене"], not: ["топен", "крем", "синьо", "бри", "моцарел"] },
      ],
    },
    kashkaval: {
      demoId: 907,
      matchers: [
        { all: ["кашкавал", "краве"], not: ["пушен", "растител"] },
        { all: ["кашкавал"], not: ["пушен", "растител", "овчи", "кози"] },
      ],
    },
    butter: {
      demoId: 906,
      matchers: [
        {
          all: ["краве масло"],
          not: ["фъстъч", "маргарин", "растител", "какаов", "кокосов"],
        },
        {
          all: ["масло"],
          not: [
            "маслин",
            "фъстъч",
            "маргарин",
            "двигател",
            "кокосов",
            "слънчогл",
            "етерич",
          ],
        },
      ],
    },
    flour: {
      demoId: 4,
      matchers: [
        {
          all: ["брашно", "500"],
          not: ["царевич", "лимец", "бадем", "безглутен"],
        },
        {
          all: ["брашно"],
          not: ["царевич", "бадем", "кокосов", "безглутен", "оризов"],
        },
      ],
    },
    rice: {
      demoId: 904,
      matchers: [
        {
          all: ["ориз"],
          not: ["оризов", "пудинг", "мляко", "каша", "вафл", "суши"],
        },
      ],
    },
    pasta: {
      demoId: 905,
      matchers: [
        { all: ["спагети"], not: ["сос"] },
        { all: ["макарони"], not: ["сос"] },
        { all: ["паста"], not: ["зъб", "домат", "лют", "риб"] },
      ],
    },
    chicken: {
      demoId: 31,
      matchers: [
        {
          all: ["пилешко", "филе"],
          not: ["панир", "пушен", "шунка", "колбас"],
        },
        { all: ["пиле", "охладен"], not: ["панир", "печен"] },
        {
          all: ["пилешко"],
          not: ["супа", "бульон", "пастет", "кренвирш", "колбас", "салам"],
        },
      ],
    },
    pork: {
      demoId: null,
      matchers: [
        {
          all: ["свинск", "месо"],
          not: ["колбас", "луканк", "суджук", "консерв"],
        },
        { all: ["свинск", "плешк"], not: ["колбас"] },
        { all: ["свинск", "бут"], not: ["колбас"] },
      ],
    },
    oil: {
      demoId: 45,
      matchers: [
        { all: ["слънчогледово", "олио"], not: ["зехтин", "маслин"] },
        { all: ["олио"], not: ["маслин", "зехтин", "кокосов", "риб"] },
      ],
    },
    sugar: {
      demoId: 908,
      matchers: [
        { all: ["бяла захар"], not: ["пудра", "ванилов", "кафяв", "тръстик"] },
        { all: ["захар", "кристал"], not: ["пудра", "ванилов"] },
        {
          all: ["захар"],
          not: ["пудра", "ванилов", "кафяв", "без захар", "подслад", "бонбон"],
        },
      ],
    },
    potatoes: {
      demoId: 903,
      matchers: [
        {
          all: ["картофи"],
          not: ["чипс", "пюре", "замраз", "сладк", "бланшир"],
        },
      ],
    },
    tomatoes: {
      demoId: 52,
      matchers: [
        {
          all: ["домати"],
          not: [
            "консерв",
            "пюре",
            "сос",
            "сушен",
            "сок",
            "кетчуп",
            "белен",
            "нарязан",
          ],
        },
      ],
    },
    cucumbers: {
      demoId: null,
      matchers: [
        {
          all: ["краставиц"],
          not: ["кисел", "корнишон", "маринован", "турши"],
        },
      ],
    },
    bananas: {
      demoId: 901,
      matchers: [
        { all: ["банани"], not: ["чипс", "сушен", "сок", "нектар", "йогурт"] },
      ],
    },
    apples: {
      demoId: 902,
      matchers: [
        {
          all: ["ябълки"],
          not: ["оцет", "сок", "нектар", "сушен", "компот", "пай", "конфит"],
        },
      ],
    },
    onions: {
      demoId: null,
      matchers: [
        { all: ["лук"], not: ["чесън", "праз", "пържен", "сушен", "чипс"] },
      ],
    },
    beans: {
      demoId: null,
      matchers: [
        { all: ["боб"], not: ["консерв", "зелен", "соев"] },
        { all: ["леща"], not: ["консерв", "чипс"] },
      ],
    },
  };

  const DEFAULT_KEYS = [
    ["freshMilk", 2],
    ["eggs", 1],
    ["whiteBread", 1],
    ["cheese", 1],
    ["potatoes", 1],
  ];

  const POPULAR_KEYS = [
    "freshMilk",
    "eggs",
    "whiteBread",
    "cheese",
    "potatoes",
    "tomatoes",
    "yogurt",
    "chicken",
    "oil",
    "bananas",
    "apples",
    "kashkaval",
    "butter",
    "flour",
    "sugar",
    "rice",
    "cucumbers",
    "pork",
  ];

  const TEMPLATE_SPECS = [
    {
      id: "week",
      emoji: "🛒",
      name: "Седмична за двама",
      desc: "Мляко, яйца, хляб, сирене, месо, картофи и плодове",
      entries: [
        ["freshMilk", 2],
        ["yogurt", 2],
        ["eggs", 1],
        ["whiteBread", 2],
        ["cheese", 1],
        ["chicken", 1],
        ["potatoes", 2],
        ["tomatoes", 1],
        ["oil", 1],
        ["bananas", 1],
      ],
    },
    {
      id: "breakfast",
      emoji: "🥐",
      name: "Закуска",
      desc: "Мляко, яйца, хляб, сирене и масло",
      entries: [
        ["freshMilk", 1],
        ["yogurt", 1],
        ["eggs", 1],
        ["whiteBread", 1],
        ["butter", 1],
        ["cheese", 1],
      ],
    },
    {
      id: "student",
      emoji: "🍝",
      name: "Студентска кошница",
      desc: "Бързо, засищащо и бюджетно",
      entries: [
        ["pasta", 2],
        ["rice", 1],
        ["eggs", 1],
        ["potatoes", 2],
        ["whiteBread", 1],
        ["oil", 1],
      ],
    },
    {
      id: "fresh",
      emoji: "🥗",
      name: "Свежа кошница",
      desc: "Картофи, домати, краставици и плодове",
      entries: [
        ["potatoes", 2],
        ["tomatoes", 1],
        ["cucumbers", 1],
        ["bananas", 1],
        ["apples", 1],
        ["onions", 1],
      ],
    },
    {
      id: "dairy",
      emoji: "🧀",
      name: "Млечна кошница",
      desc: "Сирене, кашкавал, кисело и прясно мляко",
      entries: [
        ["cheese", 1],
        ["kashkaval", 1],
        ["yogurt", 3],
        ["freshMilk", 2],
        ["butter", 1],
      ],
    },
    {
      id: "baking",
      emoji: "🍰",
      name: "За печене",
      desc: "Брашно, яйца, захар, масло и мляко",
      entries: [
        ["flour", 2],
        ["eggs", 2],
        ["sugar", 1],
        ["butter", 2],
        ["freshMilk", 1],
      ],
    },
  ];

  function resolveStapleId(key, usedIds = new Set()) {
    const spec = STAPLE_SPECS[key];
    if (!spec) return null;
    if (
      rt.mode === "demo" &&
      spec.demoId != null &&
      rt.catById.has(spec.demoId)
    ) {
      return spec.demoId;
    }
    const cats = rt.meta.categories;
    if (!cats.length) return null;

    let bestId = null;
    let bestScore = -Infinity;

    for (let mIdx = 0; mIdx < spec.matchers.length; mIdx++) {
      const m = spec.matchers[mIdx];
      for (const c of cats) {
        if (usedIds.has(c.id)) continue;
        const hay = norm(c.name);
        if (m.not && m.not.some((bad) => hay.includes(bad))) continue;
        if (m.all && !m.all.every((req) => hay.includes(req))) continue;

        let score = 100 - mIdx * 20;
        if (m.all && m.all.length && hay.startsWith(m.all[0])) score += 18;
        // Предпочитаме по-кратки, стандартни ежедневни категории
        score -= Math.min(40, c.name.length * 0.45);
        // Леко предимство за 1 кг / 1 л / 10 бр.
        if (
          wordRe("1\\s*(?:кг|л)|10\\s*бр|400\\s*г|500\\s*г|650\\s*г").test(
            c.name,
          )
        ) {
          score += 6;
        }
        if (score > bestScore) {
          bestScore = score;
          bestId = c.id;
        }
      }
      if (bestId != null) break;
    }
    return bestId;
  }

  function resolveEntries(entries) {
    const used = new Set();
    const out = [];
    for (const [key, qty] of entries) {
      const id = resolveStapleId(key, used);
      if (id != null && !used.has(id)) {
        used.add(id);
        out.push({ category_id: id, qty });
      }
    }
    return out;
  }

  function resolveDefaultItems() {
    const items = resolveEntries(DEFAULT_KEYS);
    if (items.length >= 2) return items;
    // Краен резерв: първите 4 категории, без оцет/подправки
    return rt.meta.categories
      .filter((c) => !wordRe("оцет|сол|черен пипер").test(c.name))
      .slice(0, 4)
      .map((c) => ({ category_id: c.id, qty: 1 }));
  }

  function resolvePopularIds() {
    const used = new Set();
    const out = [];
    for (const key of POPULAR_KEYS) {
      const id = resolveStapleId(key, used);
      if (id != null && !used.has(id)) {
        used.add(id);
        out.push(id);
      }
    }
    return out;
  }

  function resolveTemplates() {
    return TEMPLATE_SPECS.map((t) => ({
      id: t.id,
      emoji: t.emoji,
      name: t.name,
      desc: t.desc,
      items: resolveEntries(t.entries),
    })).filter((t) => t.items.length >= 2);
  }

  /* ───────────────────────── persistent state ───────────────────────── */
  const DEMO_DEFAULT_IDS = [12, 20, 1, 18];
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
    seededMode: null, // "live" | "demo" | "custom"
  };

  function cleanBudget(v) {
    if (v == null || v === "") return null;
    const n =
      typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    if (Number.isNaN(n) || n <= 0) return null;
    if (!Number.isFinite(n) || n > MAX_BUDGET) return MAX_BUDGET;
    return Math.round(n * 100) / 100;
  }

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

  function isLegacyDemoDefault(items) {
    if (!Array.isArray(items) || items.length !== DEMO_DEFAULT_IDS.length)
      return false;
    return items.every(
      (it, idx) => Number(it.category_id) === DEMO_DEFAULT_IDS[idx],
    );
  }

  function loadState() {
    let saved = null;
    let fromLegacy = false;
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const k of LEGACY_KEYS) {
          raw = localStorage.getItem(k);
          if (raw) {
            fromLegacy = true;
            break;
          }
        }
      }
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
    st.budget = cleanBudget(st.budget);
    st.excluded_chains = Array.isArray(st.excluded_chains)
      ? st.excluded_chains.map(String)
      : [];
    st.max_stores = clamp(Math.round(Number(st.max_stores) || 2), 1, 3);
    st.tab = ["compare", "catalog", "plan", "deals", "history"].includes(st.tab)
      ? st.tab
      : "compare";
    st.checked = st.checked && typeof st.checked === "object" ? st.checked : {};
    st.saved = Array.isArray(st.saved) ? st.saved.slice(0, 20) : [];
    if (!saved || (fromLegacy && isLegacyDemoDefault(st.items))) {
      st.seededMode = null; // ще се инициализира спрямо реалните категории
    } else if (!st.seededMode) {
      st.seededMode = "custom";
    }
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
    offline: false,
    meta: { settlements: [], categories: [], chains: [] },
    catById: new Map(),
    knownCats: new Map(),
    settlementByCode: new Map(),
    chainDisplay: new Map(),
    chainColors: new Map(),
    popularIds: [],
    templates: [],

    result: null,
    view: null,
    loading: false,
    error: null,
    diagnosis: null,
    trend: null,
    trendChain: "market", // "market" | specific chain_name
    reqSeq: 0,
    trendToken: 0,
    histToken: 0,
    prevBest: null,

    histories: new Map(),

    rankView: "rank",
    openChains: new Set(),
    openTouched: false,
    excludedOpen: false,
    excludedDiag: null,
    excludedDiagLoading: false,

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
      token: 0,
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
    rebuildChainVisuals(meta.chains);
    rt.popularIds = resolvePopularIds();
    rt.templates = resolveTemplates();
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
    // Уверяваме се, че всички вериги от резултатите имат уникални цветове и чисти имена
    const missingFromVisuals = rankings.some(
      (r) => !rt.chainColors.has(r.chain_name),
    );
    if (missingFromVisuals) {
      rebuildChainVisuals(
        rt.meta.chains.concat(rankings.map((r) => r.chain_name)),
      );
    }
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
      store_address: String(p.store_address || ""),
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
  const isTimeout = (e) => !!(e && e.name === "AbortError");
  const isOutage = (e) =>
    !e || (!isTimeout(e) && (e.status == null || e.status >= 500));

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
    // Ако все още сме на фабрична кошница от друг режим (или първо зареждане), подбираме смислени основни продукти
    if (
      opts.items &&
      state.seededMode !== "custom" &&
      state.seededMode !== rt.mode
    ) {
      const seeded = resolveDefaultItems();
      if (seeded.length) {
        state.items = seeded;
        state.seededMode = rt.mode;
        changed = true;
      }
    } else if (opts.items) {
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
    sanitizeState();
    if (hooks.offline) hooks.offline(err);
  }

  async function connect() {
    try {
      const raw = await http("/meta/init", { timeout: 12000 });
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
            timeout: 15000,
          });
        } catch (e) {
          if (isTimeout(e)) {
            throw new Error(
              "Сървърът отговаря по-бавно от очакваното. Опитай отново.",
            );
          }
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
          const rows = await http(`/products?${q.toString()}`, {
            timeout: 25000,
          });
          return rows.map(normProduct);
        } catch (e) {
          if (isTimeout(e)) {
            throw new Error(
              "Зареждането на продуктите отне твърде дълго. Опитай отново.",
            );
          }
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
            { timeout: 15000 },
          );
          return normHistory(raw);
        } catch (e) {
          if (e && e.status === 404) return null;
          // Бавна или неуспешна заявка за история не трябва да изключва целия Live режим
          console.warn(
            "[SmartBasket] Историята не се зареди за продукт",
            productId,
            e && e.message,
          );
          throw e;
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

  /* ───── лична инфлация: адаптивен прозорец (2..30 дни) + пазарно средно или конкретна верига ───── */
  function regularAtDate(h, d) {
    let idx = 0;
    for (let i = 0; i < h.dates.length; i++) {
      if (h.dates[i] <= d) idx = i;
      else break;
    }
    return h.regular_prices[idx];
  }

  function computeTrend(items, hs, chainLabel) {
    const rows = [];
    const usable = [];
    let maxSpanDays = 0;

    items.forEach((it, i) => {
      const h = hs[i];
      if (!h || h.dates.length < 2) return;
      const last = h.dates.length - 1;
      const lastMs = ts(h.dates[last]);
      let j = 0;
      while (j < last && ts(h.dates[j]) < lastMs - 30 * DAY) j++;
      if (j >= last) return;
      const span = Math.max(1, Math.round((lastMs - ts(h.dates[j])) / DAY));
      const now = h.regular_prices[last];
      const then = h.regular_prices[j];
      if (!(then > 0) || !(now > 0)) return;
      if (span > maxSpanDays) maxSpanDays = span;
      rows.push({
        name: it.product_name,
        category_id: it.category_id,
        product_id: it.product_id,
        chain_name: h.chain_name || chainLabel,
        qty: it.qty,
        now,
        then,
        delta: (now - then) * it.qty,
        pct: (now - then) / then,
      });
      usable.push({ it, h });
    });

    if (!rows.length) {
      const hasAny = hs.some((h) => h && h.dates.length >= 1);
      return { state: hasAny ? "single_day" : "empty" };
    }

    const sumNow = rows.reduce((a, r) => a + r.now * r.qty, 0);
    const sumThen = rows.reduce((a, r) => a + r.then * r.qty, 0);
    const allDates = Array.from(
      new Set(usable.flatMap(({ h }) => h.dates)),
    ).sort();
    const lastMs = ts(allDates[allDates.length - 1]);
    const baseDates = allDates.filter((d) => ts(d) >= lastMs - 30 * DAY);

    const series = baseDates.map((d) => {
      let total = 0;
      usable.forEach(({ it, h }) => {
        total += regularAtDate(h, d) * it.qty;
      });
      return total;
    });

    rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return {
      state: "ready",
      scope: chainLabel || "chain",
      spanDays: Math.min(30, maxSpanDays),
      pct: (sumNow - sumThen) / sumThen,
      delta: sumNow - sumThen,
      rows,
      series,
      covered: rows.length,
      total: items.length,
    };
  }

  function computeMarketTrend(view, histByProd) {
    // За всяка категория в кошницата усредняваме базовата цена по всички видими вериги с история (>= 2 дни)
    const rows = [];
    const catSeries = [];
    let maxSpanDays = 0;
    let hasSingleDay = false;

    state.items.forEach((bItem) => {
      const byChain = view.table.get(bItem.category_id);
      if (!byChain) return;
      const chainEntries = [];
      byChain.forEach((it) => {
        const h = histByProd.get(it.product_id);
        if (h && h.dates.length >= 2) chainEntries.push({ it, h });
        else if (h && h.dates.length === 1) hasSingleDay = true;
      });
      if (!chainEntries.length) return;

      const dates = Array.from(
        new Set(chainEntries.flatMap((x) => x.h.dates)),
      ).sort();
      const lastDate = dates[dates.length - 1];
      const lastMs = ts(lastDate);
      let startDate = dates[0];
      for (const d of dates) {
        if (ts(d) >= lastMs - 30 * DAY) {
          startDate = d;
          break;
        }
      }
      if (startDate === lastDate) return;
      const span = Math.max(1, Math.round((lastMs - ts(startDate)) / DAY));
      if (span > maxSpanDays) maxSpanDays = span;

      const avgAt = (d) => {
        let s = 0;
        let c = 0;
        chainEntries.forEach(({ h }) => {
          const val = regularAtDate(h, d);
          if (val > 0) {
            s += val;
            c++;
          }
        });
        return c ? s / c : 0;
      };

      const now = avgAt(lastDate);
      const then = avgAt(startDate);
      if (!(now > 0) || !(then > 0)) return;

      const catObj =
        rt.catById.get(bItem.category_id) ||
        rt.knownCats.get(bItem.category_id);
      const cheapest = chainEntries[0].it;
      rows.push({
        name: catObj ? catObj.name : cheapest.product_name,
        category_id: bItem.category_id,
        product_id: cheapest.product_id,
        chain_name: cheapest.chain,
        qty: bItem.qty,
        now,
        then,
        delta: (now - then) * bItem.qty,
        pct: (now - then) / then,
        chainCount: chainEntries.length,
      });
      catSeries.push({ qty: bItem.qty, avgAt, dates });
    });

    if (!rows.length) {
      return { state: hasSingleDay ? "single_day" : "empty" };
    }

    const sumNow = rows.reduce((a, r) => a + r.now * r.qty, 0);
    const sumThen = rows.reduce((a, r) => a + r.then * r.qty, 0);
    const allDates = Array.from(
      new Set(catSeries.flatMap((x) => x.dates)),
    ).sort();
    const lastMs = ts(allDates[allDates.length - 1]);
    const baseDates = allDates.filter((d) => ts(d) >= lastMs - 30 * DAY);

    const series = baseDates.map((d) =>
      catSeries.reduce((acc, c) => acc + c.avgAt(d) * c.qty, 0),
    );

    rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return {
      state: "ready",
      scope: "market",
      spanDays: Math.min(30, maxSpanDays),
      pct: (sumNow - sumThen) / sumThen,
      delta: sumNow - sumThen,
      rows,
      series,
      covered: rows.length,
      total: state.items.length,
    };
  }

  /* ───────────────────────── export ───────────────────────── */
  window.SB = {
    DEMO,
    API,
    DAY,
    MAX_BUDGET,
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
    displayChain,
    chainColor,
    smartShortName,
    resolveDefaultItems,
    state,
    saveState,
    cleanBudget,
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
    computeMarketTrend,
  };
})();
