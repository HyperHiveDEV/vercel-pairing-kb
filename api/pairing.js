// /api/pairing.js — version finale pour Vercel (CommonJS)
// Compatible Webflow + OpenAI GPT-4o-mini

let KB_CACHE = { loaded: false, dish_to_styles:{}, style_to_appellations:{}, synonyms:{} };

async function loadKB(req) {
  if (KB_CACHE.loaded) return KB_CACHE;
  const host = req?.headers?.host || "";
  const proto = (req?.headers?.["x-forwarded-proto"] || "https");
  const base = process.env.KB_BASE_URL || (host ? `${proto}://${host}` : "");
  const urls = {
    dish_to_styles: `${base}/dish_to_styles.json`,
    style_to_appellations: `${base}/style_to_appellations.json`,
    synonyms: `${base}/synonyms.json`
  };
  const [d2s, s2a, syn] = await Promise.all([
    fetch(urls.dish_to_styles).then(r=>r.json()),
    fetch(urls.style_to_appellations).then(r=>r.json()),
    fetch(urls.synonyms).then(r=>r.json())
  ]);
  KB_CACHE = { loaded: true, dish_to_styles: d2s, style_to_appellations: s2a, synonyms: syn };
  return KB_CACHE;
}

function normalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }

function expandWithSynonyms(q, synonyms) {
  const bag = new Set([q]);
  Object.entries(synonyms||{}).forEach(([root, alts])=>{
    if (q.includes(root)) alts.forEach(a=>bag.add(q.replace(root, a)));
    alts.forEach(a=>{ if(q.includes(a)) bag.add(q.replace(a, root)); });
  });
  return Array.from(bag);
}

function pickFirstMatch(query, rulesObj){
  for (const pattern in rulesObj) {
    const re = new RegExp(pattern, 'i');
    if (re.test(query)) return rulesObj[pattern];
  }
  return [];
}

async function buildKB(mode, query, req) {
  const { dish_to_styles, style_to_appellations, synonyms } = await loadKB(req);
  const kb = { styles: [], appellations: [] };
  const base = normalize(query||'');
  if (!base) return kb;

  if (mode === 'dish') {
    const candidates = expandWithSynonyms(base, synonyms || {});
    for (const cand of candidates) {
      const styles = pickFirstMatch(cand, dish_to_styles);
      if (styles?.length) {
        kb.styles = styles;
        kb.appellations = styles.flatMap(s => style_to_appellations[s] || []).slice(0, 20);
        break;
      }
    }
  } else if (mode === 'wine') {
    const wineHints = [
      { re: /\bpinot\s*noir|beaujolais|bourgogne\b/i, styles: ["rouge léger"] },
      { re: /\bchardonnay|meursault|pouilly-?fuiss[eé]\b/i, styles: ["blanc boisé"] },
      { re: /\bsauvignon|sancerre|pouilly-?fum[eé]\b/i, styles: ["blanc vif"] },
      { re: /\briesling|alsace\b/i, styles: ["blanc vif","blanc minéral"] },
      { re: /\bsyrah|cornas|côte[-\s]?rôtie|saint[-\s]?joseph\b/i, styles: ["rouge puissant"] },
      { re: /\bgrenache|châteauneuf|sud\b/i, styles: ["rouge méditerranéen","rouge puissant"] },
      { re: /\bmadiran|cahors|tannat\b/i, styles: ["rouge structuré tannique"] },
      { re: /\bchampagne|crémant|effervescent\b/i, styles: ["effervescent brut"] },
    ];
    for (const hint of wineHints) {
      if (hint.re.test(query)) {
        kb.styles = hint.styles;
        kb.appellations = hint.styles.flatMap(s => (style_to_appellations||{})[s] || []).slice(0, 20);
        break;
      }
    }
  }
  return kb;
}

function fallbackFromKB(kb, s2a) {
  if (!kb.styles?.length) return null;
  const titles = ["Classic pairing","Bold pairing","Terroir pairing"];
  return {
    suggestions: kb.styles.slice(0,3).map((style,i)=>({
      title: titles[i] || "Suggestion",
      pairing: style,
      why: "Based on internal dish/style/appellation matching.",
      serving_temp: /blanc|rosé|effervescent|cidre/i.test(style) ? "8–12°C" : "16–18°C",
      notes: (s2a?.[style] || []).slice(0, 3)
    })),
    disclaimer: "Indicative suggestions – please enjoy responsibly."
  };
}

// ✅ CommonJS export — required for Vercel
module.exports = async function handler(req, res) {
  // 🔒 Autorise ton domaine Webflow pour éviter les erreurs CORS
  const allowedOrigin = "https://labonicave.webflow.io"; // ← ton site Webflow
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET check
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, hint: "POST a JSON body {mode, query, prefs}" });
  }

  try {
    const { mode, query, prefs } = req.body || {};
    if (!mode || !query) return res.status(400).json({ error: "Missing params" });

    const { style_to_appellations } = await loadKB(req);
    const kb = await buildKB(mode, query, req);

    const systemPrompt = [
      "You are a professional French sommelier.",
      "- If input is a wine: suggest 3 DISHES (classic, bold, terroir).",
      "- If input is a dish: suggest 3 WINE STYLES and 1–2 French APPELLATIONS.",
      `- Prioritize internal knowledge base (styles/appellations): ${JSON.stringify(kb)}.`,
      '- Respond strictly in JSON: {"suggestions":[...]}',
      "Respond in French only."
    ].join(" ");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ mode, query, prefs }) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 700,
    };

    const llm = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!llm.ok) {
      const text = await llm.text().catch(() => "");
      const fb = fallbackFromKB(kb, style_to_appellations);
      if (fb) return res.status(200).json(fb);
      return res.status(500).json({ error: "LLM error", details: text.slice(0, 600) });
    }

    const data = await llm.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    if (!Array.isArray(parsed.suggestions) || !parsed.suggestions.length) {
      const fb = fallbackFromKB(kb, style_to_appellations);
      if (fb) return res.status(200).json(fb);
      return res.status(200).json({ suggestions: [], disclaimer: "Indicative suggestions – please enjoy responsibly." });
    }

    parsed.disclaimer = "Indicative suggestions – please enjoy responsibly.";
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Server crash", message: err?.message || String(err) });
  }
};
