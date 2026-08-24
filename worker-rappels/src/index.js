/* ============================================================
   PIC — Worker de rappels (déclencheur Cron + Web Push)
   Envoie une notification par espace quand des échéances approchent.
   Le message est sans contenu chiffré : le service worker récupère
   le détail auprès de /api/rappels. Rien de personnel ne transite
   par le service de push.
   ============================================================ */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  /* Déclenchement manuel pour tester : /run?key=<CRON_TEST_KEY> */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run" && env.CRON_TEST_KEY && url.searchParams.get("key") === env.CRON_TEST_KEY) {
      const report = await run(env);
      return new Response(JSON.stringify(report, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return new Response("PIC — worker de rappels. Rien à voir ici.", { status: 200 });
  }
};

async function run(env) {
  const report = { spaces: 0, notified: 0, cleaned: 0, errors: [] };
  if (!env.DB || !env.VAPID_PUBLIC || !env.VAPID_JWK) {
    report.errors.push("Liaison D1 ou clés VAPID manquantes.");
    return report;
  }

  const spaces = await env.DB.prepare(`SELECT DISTINCT space FROM subs`).all();

  for (const row of spaces.results || []) {
    const space = row.space;
    report.spaces++;

    const settingsRow = await env.DB.prepare(`SELECT settings FROM meta WHERE space = ?1`).bind(space).first();
    let lead = 1;
    try { lead = Number(JSON.parse(settingsRow?.settings || "{}").lead ?? 1); } catch (e) { /* défaut */ }
    lead = Math.max(0, Math.min(30, lead));

    const limit = new Date(Date.now() + lead * 864e5).toISOString().slice(0, 10);
    const due = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tasks
        WHERE space = ?1 AND deleted = 0 AND archived = 0
          AND echeance IS NOT NULL AND echeance <> '' AND echeance <= ?2`
    ).bind(space, limit).first();

    if (!due || !due.n) continue;

    const subs = await env.DB.prepare(
      `SELECT endpoint FROM subs WHERE space = ?1`
    ).bind(space).all();

    for (const s of subs.results || []) {
      try {
        const status = await sendPush(s.endpoint, env);
        if (status === 404 || status === 410) {
          await env.DB.prepare(`DELETE FROM subs WHERE endpoint = ?1`).bind(s.endpoint).run();
          report.cleaned++;
        } else if (status >= 200 && status < 300) {
          await env.DB.prepare(`UPDATE subs SET last_sent = ?1 WHERE endpoint = ?2`)
            .bind(new Date().toISOString(), s.endpoint).run();
          report.notified++;
        } else {
          report.errors.push(`HTTP ${status}`);
        }
      } catch (e) {
        report.errors.push(String(e.message || e));
      }
    }
  }
  return report;
}

/* ---------- Web Push, message sans contenu (RFC 8030 + VAPID) ---------- */
async function sendPush(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJWT(aud, env);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "TTL": "43200",
      "Urgency": "normal",
      "Content-Length": "0",
      "Authorization": `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`
    }
  });
  return res.status;
}

async function vapidJWT(aud, env) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64url(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:contact@example.com"
  }));

  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
