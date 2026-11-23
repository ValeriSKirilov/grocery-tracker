/* ==========================================================================
   demo-data.js — демо каталог за режим без бекенд.
   Връща данни със същата форма като FastAPI слоя (optimize / products / history),
   така че UI кодът не прави разлика между "live" и "demo".
   ========================================================================== */
(function () {
  "use strict";

  var DAY = 86400000;
  var CHAINS = ["Billa", "Kaufland", "Lidl", "Fantastico"];

  var SETTLEMENTS = [
    { code: "68134", name: "София", mult: 1.0 },
    { code: "56784", name: "Пловдив", mult: 0.96 },
    { code: "10135", name: "Варна", mult: 0.98 },
    { code: "07079", name: "Бургас", mult: 0.97 },
    { code: "63427", name: "Русе", mult: 0.95 },
    { code: "68850", name: "Стара Загора", mult: 0.95 },
    { code: "56722", name: "Плевен", mult: 0.94 },
    { code: "10447", name: "Велико Търново", mult: 0.96 },
  ];

  var G_DAIRY = "Мляко, млечни продукти и яйца";
  var G_BREAD = "Хляб, зърнени храни и брашно";
  var G_MEAT = "Месо, риба и колбаси";
  var G_FATS = "Мазнини, захар, варива и подправки";
  var G_FRUIT = "Плодове и зеленчуци";

  var CATEGORIES = [
    {
      id: 12,
      name: "Прясно мляко 2%–3.6% (1 л)",
      short: "Прясно мляко 1 л",
      group: G_DAIRY,
    },
    {
      id: 15,
      name: "Кисело мляко 3.6% (400 г)",
      short: "Кисело мляко 400 г",
      group: G_DAIRY,
    },
    {
      id: 18,
      name: "Краве сирене бяло саламурено (1 кг)",
      short: "Краве сирене 1 кг",
      group: G_DAIRY,
    },
    {
      id: 20,
      name: "Яйца размер М/L (10 бр.)",
      short: "Яйца 10 бр.",
      group: G_DAIRY,
    },
    {
      id: 906,
      name: "Краве масло (125 г)",
      short: "Масло 125 г",
      group: G_DAIRY,
    },
    {
      id: 907,
      name: "Кашкавал краве (1 кг)",
      short: "Кашкавал 1 кг",
      group: G_DAIRY,
    },
    {
      id: 1,
      name: "Бял хляб нарязан (650 г)",
      short: "Бял хляб 650 г",
      group: G_BREAD,
    },
    {
      id: 4,
      name: "Брашно тип 500 (1 кг)",
      short: "Брашно 1 кг",
      group: G_BREAD,
    },
    {
      id: 904,
      name: "Ориз дългозърнест (1 кг)",
      short: "Ориз 1 кг",
      group: G_BREAD,
    },
    {
      id: 905,
      name: "Спагети (500 г)",
      short: "Спагети 500 г",
      group: G_BREAD,
    },
    {
      id: 31,
      name: "Пилешко филе охладено (1 кг)",
      short: "Пилешко филе 1 кг",
      group: G_MEAT,
    },
    {
      id: 45,
      name: "Слънчогледово олио (1 л)",
      short: "Олио 1 л",
      group: G_FATS,
    },
    {
      id: 908,
      name: "Захар кристална (1 кг)",
      short: "Захар 1 кг",
      group: G_FATS,
    },
    {
      id: 52,
      name: "Домати пресни (1 кг)",
      short: "Домати 1 кг",
      group: G_FRUIT,
    },
    { id: 901, name: "Банани (1 кг)", short: "Банани 1 кг", group: G_FRUIT },
    { id: 902, name: "Ябълки (1 кг)", short: "Ябълки 1 кг", group: G_FRUIT },
    { id: 903, name: "Картофи (1 кг)", short: "Картофи 1 кг", group: G_FRUIT },
  ];

  // [име на продукта, базова цена €, промо цена € | null, фалшива промоция?]
  var P = {
    12: {
      Billa: ["Прясно мляко Верея 3% 1 л", 1.49, 1.19],
      Kaufland: ["K-Classic прясно мляко 3.5% 1 л", 1.39, null],
      Lidl: ["Pilos прясно мляко 3.2% 1 л", 1.35, 1.15],
      Fantastico: ["Прясно мляко Олимпус 3.7% 1 л", 1.65, 1.39, true],
    },
    15: {
      Billa: ["Кисело мляко Елена 3.6% 400 г", 0.79, 0.65],
      Kaufland: ["Кисело мляко Боженци 3.6% 400 г", 0.85, 0.69],
      Lidl: ["Pilos кисело мляко 3.6% 400 г", 0.72, null],
      Fantastico: ["Кисело мляко Хармоника 3.6% 400 г", 0.95, 0.79],
    },
    18: {
      Billa: ["Сирене Сая 1 кг", 8.9, 7.49],
      Kaufland: ["Сирене Маджаров 1 кг", 9.4, 7.99, true],
      Lidl: ["Родна стряха краве сирене 1 кг", 8.6, null],
      Fantastico: ["Сирене Лачев 1 кг", 9.8, 8.4, true],
    },
    20: {
      Billa: ["Яйца Аквилон М 10 бр.", 2.65, null],
      Kaufland: ["Яйца K-Classic L 10 бр.", 2.55, 2.15],
      Lidl: ["Яйца от свободни кокошки 10 бр.", 2.6, 2.29],
      Fantastico: ["Яйца Мизия М 10 бр.", 2.75, null],
    },
    906: {
      Billa: ["Краве масло 125 г", 2.29, 1.89],
      Kaufland: ["Краве масло K-Classic 125 г", 2.19, null],
      Lidl: ["Краве масло 125 г", 2.09, 1.79],
      Fantastico: ["Краве масло 125 г", 2.45, 2.19],
    },
    907: {
      Billa: ["Кашкавал краве 1 кг", 11.9, 9.99],
      Kaufland: ["Кашкавал краве 1 кг", 11.4, null],
      Lidl: ["Кашкавал краве 1 кг", 10.9, 9.49],
      Fantastico: ["Кашкавал краве 1 кг", 12.5, 10.9, true],
    },
    1: {
      Billa: ["Хляб Симид бял 650 г", 1.15, 0.95],
      Kaufland: ["Бял хляб Добруджа 650 г", 1.1, null],
      Lidl: ["Белият хляб 650 г", 1.09, 0.89],
      Fantastico: ["Хляб Златна Добруджа 650 г", 1.25, null],
    },
    4: {
      Billa: ["Брашно София Мел 1 кг", 0.99, null],
      Kaufland: ["Брашно Екстра 1 кг", 0.89, 0.75],
      Lidl: ["Belbake брашно тип 500 1 кг", 0.85, null],
      Fantastico: ["Брашно София Мел Класик 1 кг", 1.05, 0.89],
    },
    904: {
      Billa: ["Ориз дългозърнест 1 кг", 2.49, null],
      Kaufland: ["Ориз дългозърнест 1 кг", 2.29, 1.99],
      Lidl: ["Ориз дългозърнест 1 кг", 2.19, null],
      Fantastico: ["Ориз дългозърнест 1 кг", 2.59, 2.19],
    },
    905: {
      Billa: ["Спагети 500 г", 1.29, 0.99],
      Kaufland: ["Спагети 500 г", 1.19, null],
      Lidl: ["Спагети 500 г", 0.99, 0.89],
      Fantastico: ["Спагети 500 г", 1.39, null],
    },
    31: {
      Billa: ["Пилешко филе Градус 1 кг", 7.2, 6.19],
      Kaufland: ["Пилешко филе Лудогорско пиле 1 кг", 7.45, 6.49],
      Lidl: ["Охладено пилешко филе 1 кг", 6.99, null],
      Fantastico: ["Пилешко филе Джиев 1 кг", 7.5, null],
    },
    45: {
      Billa: ["Олио Класик 1 л", 1.79, 1.49],
      Kaufland: ["Олио Бисер 1 л", 1.85, 1.55],
      Lidl: ["Vita D'or слънчогледово олио 1 л", 1.69, null],
      Fantastico: ["Олио Папас 1 л", 1.89, 1.59],
    },
    908: {
      Billa: ["Захар 1 кг", 1.59, null],
      Kaufland: ["Захар 1 кг", 1.49, 1.29],
      Lidl: ["Захар 1 кг", 1.39, null],
      Fantastico: ["Захар 1 кг", 1.65, 1.45],
    },
    52: {
      Billa: ["Български розови домати 1 кг", 2.45, null],
      Kaufland: ["Домати градински 1 кг", 2.35, 1.99],
      Lidl: ["Домати Рома 1 кг", 2.5, 2.1],
      Fantastico: ["Розови домати 1 кг", 2.65, 2.25],
    },
    901: {
      Billa: ["Банани 1 кг", 2.19, 1.79],
      Kaufland: ["Банани 1 кг", 1.99, null],
      Lidl: ["Банани 1 кг", 1.89, 1.59],
      Fantastico: ["Банани 1 кг", 2.29, null],
    },
    902: {
      Billa: ["Ябълки 1 кг", 1.89, null],
      Kaufland: ["Ябълки 1 кг", 1.79, 1.49],
      Lidl: ["Ябълки 1 кг", 1.69, null],
      Fantastico: ["Ябълки 1 кг", 1.99, 1.69],
    },
    903: {
      Billa: ["Картофи 1 кг", 1.19, 0.99],
      Kaufland: ["Картофи 1 кг", 1.09, null],
      Lidl: ["Картофи 1 кг", 0.99, 0.85],
      Fantastico: ["Картофи 1 кг", 1.29, null],
    },
  };

  var PRODUCTS = [];
  var BY_ID = {};
  Object.keys(P).forEach(function (cid) {
    var catId = Number(cid);
    CHAINS.forEach(function (chain, idx) {
      var t = P[cid][chain];
      var prod = {
        product_id: catId * 10 + idx + 1,
        category_id: catId,
        chain_name: chain,
        name: t[0],
        reg: t[1],
        promo: t[2],
        fake: !!t[3],
      };
      PRODUCTS.push(prod);
      BY_ID[prod.product_id] = prod;
    });
  });

  /* ---------- помощни ---------- */
  function r2(n) {
    return Math.round(n * 100) / 100;
  }
  function multOf(code) {
    for (var i = 0; i < SETTLEMENTS.length; i++)
      if (SETTLEMENTS[i].code === String(code)) return SETTLEMENTS[i].mult;
    return 1;
  }
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function todayUTC() {
    var n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function iso(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function ts(d) {
    return Date.parse(d + "T00:00:00Z");
  }

  /* Детектор на фалшива промоция — същата логика като crud.get_product_history */
  function detectFake(dates, reg, promo) {
    var n = dates.length;
    if (!n || promo[n - 1] == null) return false;
    var s = n - 1;
    while (s > 0 && promo[s - 1] != null) s--;
    var startMs = ts(dates[s]);
    var baseMs = startMs - 7 * DAY;
    var win = [];
    var before = [];
    for (var i = 0; i < n; i++) {
      var t = ts(dates[i]);
      if (t >= baseMs && t < startMs) win.push(reg[i]);
      else if (t < baseMs) before.push(reg[i]);
    }
    if (!win.length || !before.length) return false;
    return Math.max.apply(null, win) > before[before.length - 1];
  }

  /* ---------- 90-дневна история (детерминистична) ---------- */
  var historyCache = {};
  function genHistory(p, ekatte, days) {
    days = days || 90;
    var mult = multOf(ekatte);
    var reg0 = r2(p.reg * mult);
    var promo0 = p.promo != null ? r2(p.promo * mult) : null;
    var rand = rng(hash(p.product_id + ":" + ekatte));
    var reg = new Array(days);
    var pro = new Array(days);
    var i;
    for (i = 0; i < days; i++) pro[i] = null;

    var price = reg0;
    reg[0] = price;
    for (i = 1; i < days; i++) {
      if (!p.fake && i > 21 && rand() < 0.035) {
        var dir = rand() < 0.7 ? -1 : 1; // назад във времето цените са по-скоро по-ниски
        price = r2(price * (1 + dir * (0.01 + rand() * 0.035)));
      }
      reg[i] = price;
    }

    if (p.fake) {
      // базовата цена е вдигната 10 дни назад, непосредствено преди промоцията (6 дни назад)
      for (i = 0; i < days; i++) reg[i] = i >= 10 ? r2(reg0 * 0.88) : reg0;
    }

    if (promo0 != null) {
      var len = p.fake ? 7 : 4 + Math.floor(rand() * 6);
      for (i = 0; i < len; i++) pro[i] = promo0;
    }
    if (!p.fake && rand() < 0.55) {
      var start = 30 + Math.floor(rand() * 20);
      var plen = 5 + Math.floor(rand() * 4);
      var depth = 0.86 + rand() * 0.08;
      for (i = start; i < Math.min(days, start + plen); i++)
        pro[i] = r2(reg[i] * depth);
    }

    var end = todayUTC();
    var dates = [];
    var regA = [];
    var proA = [];
    for (i = days - 1; i >= 0; i--) {
      dates.push(iso(end - i * DAY));
      regA.push(reg[i]);
      proA.push(pro[i]);
    }
    return {
      product_id: p.product_id,
      product_name: p.name,
      chain_name: p.chain_name,
      dates: dates,
      regular_prices: regA,
      promo_prices: proA,
      fake_discount_warning: detectFake(dates, regA, proA),
    };
  }

  /* ---------- публичен API ---------- */
  function optimize(payload) {
    var mult = multOf(payload.ekatte_code);
    var wanted = {};
    payload.items.forEach(function (it) {
      wanted[it.category_id] = it.qty;
    });
    var rankings = [];
    CHAINS.forEach(function (chain) {
      var total = 0;
      var savings = 0;
      var matched = [];
      Object.keys(wanted).forEach(function (cid) {
        var p = PRODUCTS.filter(function (x) {
          return x.chain_name === chain && x.category_id === Number(cid);
        })[0];
        if (!p) return;
        var qty = wanted[cid];
        var reg = r2(p.reg * mult);
        var promo = p.promo != null ? r2(p.promo * mult) : null;
        var unit = payload.include_promos && promo !== null ? promo : reg;
        var line = r2(unit * qty);
        total += line;
        savings += (reg - unit) * qty;
        matched.push({
          category_id: p.category_id,
          product_id: p.product_id,
          product_name: p.name,
          qty: qty,
          unit_regular_price: reg,
          unit_promo_price: promo,
          line_total: line,
        });
      });
      if (!matched.length) return;
      rankings.push({
        chain_name: chain,
        total_cost: r2(total),
        total_promo_savings: r2(savings),
        matched_items: matched,
      });
    });
    rankings.sort(function (a, b) {
      return a.total_cost - b.total_cost;
    });
    return { ekatte_code: payload.ekatte_code, rankings: rankings };
  }

  function products(params) {
    params = params || {};
    var mult = multOf(params.ekatte_code);
    var today = iso(todayUTC());
    return PRODUCTS.filter(function (p) {
      if (params.chain && p.chain_name !== params.chain) return false;
      if (params.category_id && p.category_id !== Number(params.category_id))
        return false;
      if (params.promo_only && p.promo == null) return false;
      return true;
    }).map(function (p) {
      var reg = r2(p.reg * mult);
      var promo = p.promo != null ? r2(p.promo * mult) : null;
      return {
        product_id: p.product_id,
        name: p.name,
        chain_name: p.chain_name,
        category_id: p.category_id,
        regular_price: reg,
        promo_price: promo,
        effective_price: promo != null ? promo : reg,
        date: today,
      };
    });
  }

  function history(productId, ekatte) {
    var p = BY_ID[Number(productId)];
    if (!p) return null;
    var key = p.product_id + ":" + ekatte;
    if (!historyCache[key]) historyCache[key] = genHistory(p, ekatte, 90);
    return historyCache[key];
  }

  window.SmartBasketDemo = {
    chains: CHAINS.slice(),
    settlements: SETTLEMENTS.map(function (s) {
      return { code: s.code, name: s.name };
    }),
    categories: CATEGORIES,
    optimize: optimize,
    products: products,
    history: history,
    detectFake: detectFake,
  };
})();
