export default async function handler(req, res) {
  // ✅ CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Réponse aux requêtes OPTIONS (préflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ✅ Vérifie la méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mode, query, prefs } = req.body || {};
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    // ✅ Simule une réponse IA (pour test sans GPT)
    return res.status(200).json({
      ok: true,
      suggestions: [
        {
          title: 'Classique',
          pairing: mode === 'wine' ? 'Magret de canard' : 'Pinot Noir 2020',
          why: 'Un accord typique entre tanins doux et gras du plat.',
          serving_temp: '16-18°C',
          notes: ['Rouge léger', 'Fruité', 'Boisé']
        },
        {
          title: 'Audacieux',
          pairing: mode === 'wine' ? 'Cuisine asiatique' : 'Syrah du Rhône',
          why: 'Pour un contraste entre épices et richesse aromatique.',
          serving_temp: '17°C',
          notes: ['Épicé', 'Puissant']
        },
        {
          title: 'Terroir',
          pairing: mode === 'wine' ? 'Fromages affinés' : 'Côtes-du-Rhône Villages',
          why: 'Alliance sur la rondeur et le caractère du vin.',
          serving_temp: '18°C',
          notes: ['Corsé', 'Charpenté']
        }
      ]
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
