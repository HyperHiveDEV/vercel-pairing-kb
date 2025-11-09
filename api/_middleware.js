export function middleware(req) {
  const origin = req.headers.get("origin");
  const allowedOrigin = "https://la-boni-cave.webflow.io";

  const headers = new Headers();

  if (origin === allowedOrigin || origin === "http://localhost:3000") {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");

  // ✅ Si c’est une requête OPTIONS, on répond immédiatement
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  // ✅ Sinon on laisse passer la requête à l’API
  return new Response(null, { headers });
}
