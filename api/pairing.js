// api/pairing.js
import fs from "fs/promises";
import path from "path";

/* =========================
   Utils communs
========================= */
const toASCII = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
function seededRand(seedStr) {
  let seed = Array.from(seedStr).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n, rnd) => {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};

/* =========================
   Cache JSON (chargés 1x)
========================= */
let DISH_TO_STYLES = null;
let STYLE_TO_APPS = null;

async function loadJSONsOnce() {
  if (!DISH_TO_STYLES) {
    const file = await fs.readFile(path.join(process.cwd(), "public", "dish_to_styles.json"), "utf8");
    DISH_TO_STYLES = JSON.parse(file); // { "regex": [styles...] }
  }
  if (!STYLE_TO_APPS) {
    const file = await fs.readFile(path.join(process.cwd(), "public", "style_to_appellations.json"), "utf8");
    STYLE_TO_APPS = JSON.parse(file); // { "style": [appellations...] }
  }
}

/* =========================
   Métadonnées par style
========================= */
const STYLE_META = {
  "blanc vif": { temp: "10-12°C", notes: ["Vif", "Sec"] },
  "blanc minéral": { temp: "10-12°C", notes: ["Minéral", "Tendu"] },
  "blanc aromatique demi-sec": { temp: "10-12°C", notes: ["Aromatique", "Demi-sec"] },
  "blanc boisé": { temp: "11-13°C", notes: ["Boisé", "Gourmand"] },
  "rosé vif": { temp: "8-10°C", notes: ["Frais", "Gourmand"] },
  "rosé gastronomique": { temp: "8-10°C", notes: ["Gastronomique", "Structuré"] },
  "effervescent brut": { temp: "8-10°C", notes: ["Bulles", "Sec"] },
  "rouge léger": { temp: "15-16°C", notes: ["Léger", "Fruité"] },
  "rouge léger peu tannique": { temp: "14-15°C", notes: ["Très peu tannique", "Rouge léger"] },
  "rouge moyen": { temp: "16-17°C", notes: ["Souple", "Équilibré"] },
  "rouge structuré tannique": { temp: "17-18°C", notes: ["Structuré", "Tannique"] },
  "rouge puissant": { temp: "17-18°C", notes: ["Puissant", "Épicé"] },
  "rouge méditerranéen": { temp: "16-18°C", notes: ["Solaire", "Épices"] },
  "rouge doux": { temp: "12-14°C", notes: ["Doux", "Rouge"] },
  "vin doux naturel": { temp: "12-14°C", notes: ["Doux", "Fortifié"] },
  "liquoreux": { temp: "8-10°C", notes: ["Liquoreux", "Mielleux"] },
  "oxydatif": { temp: "12-14°C", notes: ["Oxydatif", "Noix"] },
  "orange": { temp: "11-13°C", notes: ["Macération", "Tannins blancs"] },
  "cidre/alternative": { temp: "8-10°C", notes: ["Alternative", "Pomme"] }
};

// “pourquoi” générique par style
const WHY = {
  "blanc vif": "Vivacité et fraîcheur : parfait pour souligner iode et acidité.",
  "blanc minéral": "Tension minérale et salinité : idéal sur poisson/iode.",
  "effervescent brut": "Bulles et fraîcheur qui rincent le palais.",
  "blanc aromatique demi-sec": "Arômes expressifs + légère douceur : équilibre les épices.",
  "rosé vif": "Fraîcheur et gourmandise, très polyvalent.",
  "rosé gastronomique": "Plus de structure : accompagne une vraie assiette.",
  "rouge léger": "Tanins souples et fruités, restent digestes.",
  "rouge léger peu tannique": "Très peu de tanins, profil rouge tout en finesse.",
  "rouge moyen": "Équilibre entre matière et souplesse.",
  "rouge structuré tannique": "Matière et tanins : pour les viandes puissantes.",
  "rouge puissant": "Puissance et longueur pour plats riches.",
  "rouge méditerranéen": "Soleil et épices : parfait sur la tomate.",
  "blanc boisé": "Gras et boisés : accompagnent des plats plus riches.",
  "rouge doux": "Douceur rouge, complice du chocolat.",
  "vin doux naturel": "Sucrosité équilibrée par l’alcool pour les desserts.",
  "liquoreux": "Riche et mielleux : dessert aux fruits/foie gras.",
  "oxydatif": "Noix et profondeur : superbe sur fromages affinés.",
  "orange": "Tannins blancs + aromatique, très gastro.",
  "cidre/alternative": "Alternative fraîche et digeste."
};

/* =========================
   Heuristiques pour mode=wine
========================= */
function stylesFromWineName(query) {
  const q = query.toLowerCase();

  const out = new Set();

  if (/pinot|beaujolais|bourgogne/i.test(q)) out.add("rouge léger").add("rouge léger peu tannique");
  if (/syrah|grenache|mourv[eè]dre|cornas|bandol|gigondas|ch[âa]teauneuf/i.test(q))
    out.add("rouge puissant").add("rouge méditerranéen");
  if (/cahors|madiran|pauillac|m[eé]doc|margaux/i.test(q))
    out.add("rouge structuré tannique");
  if (/bordeaux|merlot|cabernet|chinon|bourgueil/i.test(q))
    out.add("rouge moyen");
  if (/chablis|muscadet|sancerre|pouilly[- ]fum[eé]|menetou|reuilly/i.test(q))
    out.add("blanc vif").add("blanc minéral");
  if (/chardonnay|meursault|pouilly[- ]fuiss[eé]|graves/i.test(q))
    out.add("blanc boisé");
  if (/gewurz|riesling|pinot gris|juran[cç]on|vouvray/i.test(q))
    out.add("blanc aromatique demi-sec");
  if (/ros[eé]|tavel|provence|coteaux/i.test(q))
    out.add("rosé vif").add("rosé gastronomique");
  if (/cr[eé]mant|champagne|mousseux|p[eé]tillant/i.test(q))
    out.add("effervescent brut");

  return [...out];
}

/* =========================
   Contrastes pour carte "Audacieux"
========================= */
const CONTRAST = {
  "rouge léger": ["blanc aromatique demi-sec", "rosé vif", "blanc vif"],
  "rouge léger peu tannique": ["blanc vif", "rosé vif"],
  "rouge moyen": ["blanc vif", "rosé gastronomique"],
  "rouge structuré tannique": ["blanc aromatique demi-sec", "rouge léger"],
  "rouge puissant": ["blanc aromatique demi-sec", "rosé gastronomique"],
  "rouge méditerranéen": ["blanc vif", "effervescent brut"],
  "blanc vif": ["rouge léger", "rosé vif"],
  "blanc minéral": ["rouge léger", "rosé vif"],
  "blanc aromatique demi-sec": ["rouge puissant", "rouge méditerranéen"],
  "blanc boisé": ["rouge moyen", "effervescent brut"],
  "rosé vif": ["blanc aromatique demi-sec", "rouge léger"],
  "rosé gastronomique": ["rouge léger peu tannique", "blanc vif"],
  "effervescent brut": ["rouge léger", "blanc vif"],
  "rouge doux": ["vin doux naturel"],
  "vin doux naturel": ["effervescent brut"],
  "liquoreux": ["demi-sec effervescent", "effervescent brut"],
  "oxydatif": ["blanc vif", "rouge léger"],
  "orange": ["blanc vif", "rosé vif"],
  "cidre/alternative": ["blanc vif", "rosé vif"]
};

/* =========================
   CORS minimal
========================= */
function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigin = "https://la-boni-cave.webflow.io"; // adapte si besoin
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === allowedOrigin || origin === "http://localhost:3000" ? origin : "*"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/* =========================
   Handler principal
========================= */
export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await loadJSONsOnce();

    const { mode = "wine", query, prefs = {} } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing query" });

    const rnd = seededRand(toASCII(query.trim()));

    // 1) Détection de styles
    const foundStyles = new Set();

    if (mode === "dish") {
      for (const [pattern, styles] of Object.entries(DISH_TO_STYLES)) {
        const re = new RegExp(pattern, "i");
        if (re.test(query)) styles.forEach((s) => foundStyles.add(s));
      }
    } else {
      stylesFromWineName(query).forEach((s) => foundStyles.add(s));
    }

    // fallback : si aucun style détecté, on propose 2 styles au hasard
    const ALL_STYLES = Object.keys(STYLE_TO_APPS);
    if (!foundStyles.size) pickN(ALL_STYLES, Math.min(2, ALL_STYLES.length), rnd).forEach((s) => foundStyles.add(s));

    // 2) Génération des suggestions
    const suggestions = [];
    const seen = new Set();

    const push = (title, pairing, why, styleKey) => {
      const k = `${title}|${pairing}`;
      if (seen.has(k)) return;
      seen.add(k);
      const meta = STYLE_META[styleKey] || { temp: "—", notes: [] };
      suggestions.push({
        title,
        pairing,
        why: why || "Accord classique du style.",
        serving_temp: meta.temp,
        notes: meta.notes
      });
    };

    const chosenStyles = pickN([...foundStyles], Math.min(3, foundStyles.size), rnd);

    if (mode === "dish") {
      // Pour un plat : on propose des APPELLATIONS
      for (const styleKey of chosenStyles) {
        const apps = STYLE_TO_APPS[styleKey] || [];
        if (!apps.length) continue;
        push("Classique", pick(apps, rnd), WHY[styleKey], styleKey);
      }
      // Audacieux : autre style
      const altStyle = pick(CONTRAST[chosenStyles[0]] || ALL_STYLES, rnd);
      const altApps = STYLE_TO_APPS[altStyle] || [];
      if (altApps.length) push("Audacieux", pick(altApps, rnd), "Contraste intéressant avec le plat.", altStyle);
    } else {
      // Pour un vin : on renvoie des PLATS types, car on n'a pas encore de mapping inverse plat->style détaillé
      const STYLE_TO_DISH_DEFAULT = {
        "rouge léger": ["volaille rôtie", "thon grillé", "cuisine bistrot"],
        "rouge léger peu tannique": ["poulet rôti", "charcuterie fine", "pizza margherita"],
        "rouge moyen": ["pâtes sauce tomate", "pizza", "viande blanche"],
        "rouge structuré tannique": ["côte de bœuf", "agneau", "bbq"],
        "rouge puissant": ["gibier", "daube", "cuisine relevée"],
        "rouge méditerranéen": ["plats à la tomate", "tajine d’agneau", "pizza épicée"],
        "blanc vif": ["sushi", "huîtres", "ceviche"],
        "blanc minéral": ["saint-jacques", "poisson grillé", "chèvre frais"],
        "blanc aromatique demi-sec": ["curry doux", "cuisine asiatique", "fromages à pâte lavée"],
        "blanc boisé": ["volaille crémée", "poisson beurre blanc", "risotto"],
        "rosé vif": ["salades composées", "tapas", "grillades estivales"],
        "rosé gastronomique": ["poisson grillé", "plats méditerranéens"],
        "effervescent brut": ["apéritif", "tapas", "sushis"],
        "orange": ["cuisine végétale", "légumes rôtis", "curry doux"],
        "oxydatif": ["comté 24 mois", "beaufort", "fromages affinés"]
      };

      for (const styleKey of chosenStyles) {
        const dishes = STYLE_TO_DISH_DEFAULT[styleKey] || ["accord de saison"];
        push("Classique", pick(dishes, rnd), WHY[styleKey], styleKey);
      }
      const altStyle = pick(CONTRAST[chosenStyles[0]] || ALL_STYLES, rnd);
      const altDishes = STYLE_TO_DISH_DEFAULT[altStyle] || ["accord audacieux"];
      push("Audacieux", pick(altDishes, rnd), "Contraste intéressant avec le style du vin.", altStyle);
    }

    // Option “Alternative budget”
    const budget = prefs?.budget ? parseFloat(prefs.budget) : null;
    if (budget && mode === "dish") {
      // petit hint budget : on prend les styles choisis et on pioche l’appellation la plus “commune”
      const styleForBudget = chosenStyles.find((s) => STYLE_TO_APPS[s]?.length) || chosenStyles[0];
      const apps = STYLE_TO_APPS[styleForBudget] || [];
      if (apps.length) {
        const budgetPick = pick(apps, rnd);
        push("Alternative budget", budgetPick, `Option potentiellement <≈ ${budget}€ dans ce style.`, styleForBudget);
      }
    }

    // Dédoublonne + limite à 5
    const final = [];
    const uniq = new Set();
    for (const s of suggestions) {
      const k = `${s.title}|${s.pairing}`;
      if (!uniq.has(k)) {
        uniq.add(k);
        final.push(s);
      }
      if (final.length >= 5) break;
    }

    return res.status(200).json({ ok: true, suggestions: final });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
