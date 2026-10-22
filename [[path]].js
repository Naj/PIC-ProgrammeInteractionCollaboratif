/* ============================================================
   TAF — API de synchronisation (Cloudflare Pages Functions + D1 + R2)
   Liaisons attendues :
     DB            →  base D1 « pic »          (tâches, réglages, rappels)
     TAF_CAPTURES  →  bucket R2 « taf-captures » (captures d'écran — facultatif)
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-TAF-Espace,X-TAF-Tache,X-TAF-Nom",
  "Cache-Control": "no-store"
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });

/* L'espace est un SHA-256 calculé par le navigateur : le serveur ne voit jamais le code. */
const isSpace = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");

  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (path === "ping") {
      return json({ ok: true, db: !!env.DB, push: !!env.VAPID_PUBLIC, r2: !!env.TAF_CAPTURES });
    }
    /* Les captures n'ont pas besoin de D1 : elles passent avant la vérification de la base. */
    if (path.startsWith("captures/")) return await captures(request, env, path.slice(9), url);
    if (!env.DB) return json({ error: "Base D1 non liée à ce projet (liaison « DB » manquante)." }, 503);

    if (path === "sync"             && request.method === "POST") return await sync(request, env);
    if (path === "push/vapid"       && request.method === "GET")  return vapid(env);
    if (path === "push/subscribe"   && request.method === "POST") return await subscribe(request, env);
    if (path === "push/unsubscribe" && request.method === "POST") return await unsubscribe(request, env);
    if (path === "rappels"          && request.method === "GET")  return await rappels(url, env);
    if (path.startsWith("share/")   && request.method === "GET")  return await getShare(path.slice(6), env);

    return json({ error: "Route inconnue." }, 404);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

/* ---------- Synchronisation ---------- */
async function sync(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !isSpace(body.space)) return json({ error: "Espace invalide." }, 400);

  const space = body.space;
  const now = new Date().toISOString();
  const incoming = Array.isArray(body.tasks) ? body.tasks.slice(0, 5000) : [];
  const stmts = [];

  for (const t of incoming) {
    if (!t || typeof t.id !== "string" || t.id.length > 64) continue;
    const payload = JSON.stringify(t);
    if (payload.length > 40000) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO tasks (space, id, payload, updated_at, deleted, echeance, archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(space, id) DO UPDATE SET
           payload    = excluded.payload,
           updated_at = excluded.updated_at,
           deleted    = excluded.deleted,
           echeance   = excluded.echeance,
           archived   = excluded.archived
         WHERE excluded.updated_at > tasks.updated_at`
      ).bind(
        space, t.id, payload, t.updatedAt || t.createdAt || now,
        t.deleted ? 1 : 0, t.echeance || null, t.archived ? 1 : 0
      )
    );
  }

  if (body.meta && typeof body.meta === "object") {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO meta (space, columns, settings, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(space) DO UPDATE SET
           columns = excluded.columns, settings = excluded.settings, updated_at = excluded.updated_at
         WHERE excluded.updated_at > meta.updated_at`
      ).bind(
        space,
        JSON.stringify(body.meta.columns || []),
        JSON.stringify(body.meta.settings || {}),
        body.meta.updatedAt || now
      )
    );
  }

  /* Token de partage en lecture seule */
  if (typeof body.shareToken === "string" && /^[a-z0-9]{6,64}$/.test(body.shareToken)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO shares (token, space, created_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(token) DO UPDATE SET space = excluded.space`
      ).bind(body.shareToken, space, now)
    );
  }

  if (stmts.length) await env.DB.batch(stmts);

  const rows = await env.DB.prepare(
    `SELECT payload FROM tasks WHERE space = ?1 ORDER BY updated_at DESC LIMIT 5000`
  ).bind(space).all();

  const meta = await env.DB.prepare(
    `SELECT columns, settings, updated_at FROM meta WHERE space = ?1`
  ).bind(space).first();

  return json({
    ok: true,
    serverTime: now,
    tasks: (rows.results || []).map(r => safeParse(r.payload)).filter(Boolean),
    meta: meta ? {
      columns: safeParse(meta.columns) || [],
      settings: safeParse(meta.settings) || {},
      updatedAt: meta.updated_at
    } : null
  });
}
const safeParse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

/* ---------- Captures d'écran (R2) ----------
   GET/PUT/DELETE /api/captures/:id            → image complète
   GET/PUT        /api/captures/:id?type=vignette → vignette
   L'en-tête X-TAF-Espace porte l'empreinte du code d'espace, comme /api/sync :
   les images sont rangées par espace, un espace ne voit jamais celles d'un autre. */
const CAPTURE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CAPTURE_MAX = 10 * 1024 * 1024;   // 10 Mo ; une capture compressée pèse ~200 Ko

async function captures(request, env, id, url) {
  if (!env.TAF_CAPTURES) {
    return json({ error: "Stockage R2 non lié à ce projet (liaison « TAF_CAPTURES » manquante).", code: "r2-absent" }, 503);
  }
  const space = request.headers.get("X-TAF-Espace") || "";
  if (!isSpace(space)) return json({ error: "Espace refusé." }, 401);
  if (!CAPTURE_ID.test(id)) return json({ error: "Identifiant invalide." }, 400);

  const dossier = url.searchParams.get("type") === "vignette" ? "/vignettes/" : "/captures/";
  const key = space + dossier + id;

  if (request.method === "GET") {
    const obj = await env.TAF_CAPTURES.get(key);
    if (!obj) return json({ error: "Capture introuvable." }, 404);
    const headers = new Headers(CORS);
    obj.writeHttpMetadata(headers);
    headers.set("ETag", obj.httpEtag);
    headers.set("Cache-Control", "private, max-age=31536000, immutable");   // une capture ne change jamais
    return new Response(obj.body, { headers });
  }

  if (request.method === "PUT") {
    const type = request.headers.get("Content-Type") || "";
    if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return json({ error: "Seules les images PNG, JPG, WebP ou GIF sont acceptées." }, 415);
    if (Number(request.headers.get("Content-Length") || 0) > CAPTURE_MAX) return json({ error: "Image trop lourde." }, 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: "Image vide." }, 400);
    if (body.byteLength > CAPTURE_MAX) return json({ error: "Image trop lourde." }, 413);
    let nom = "";
    try { nom = decodeURIComponent(request.headers.get("X-TAF-Nom") || ""); } catch (e) { nom = ""; }
    await env.TAF_CAPTURES.put(key, body, {
      httpMetadata: { contentType: type },
      customMetadata: { tacheId: (request.headers.get("X-TAF-Tache") || "").slice(0, 64), nom: nom.slice(0, 200) }
    });
    return json({ ok: true }, 201);
  }

  if (request.method === "DELETE") {
    await env.TAF_CAPTURES.delete([space + "/captures/" + id, space + "/vignettes/" + id]);
    return new Response(null, { status: 204, headers: CORS });
  }

  return json({ error: "Méthode non autorisée." }, 405);
}

/* ---------- Notifications ---------- */
function vapid(env) {
  if (!env.VAPID_PUBLIC) return json({ error: "Clé VAPID absente." }, 503);
  return json({ publicKey: env.VAPID_PUBLIC });
}

async function subscribe(request, env) {
  const body = await request.json().catch(() => null);
  const sub = body && body.subscription;
  if (!body || !isSpace(body.space) || !sub || !sub.endpoint) {
    return json({ error: "Abonnement invalide." }, 400);
  }
  const keys = sub.keys || {};
  await env.DB.prepare(
    `INSERT INTO subs (endpoint, space, p256dh, auth, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(endpoint) DO UPDATE SET space = excluded.space, p256dh = excluded.p256dh, auth = excluded.auth`
  ).bind(sub.endpoint, body.space, keys.p256dh || "", keys.auth || "", new Date().toISOString()).run();
  return json({ ok: true });
}

async function unsubscribe(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.endpoint) return json({ error: "Endpoint manquant." }, 400);
  await env.DB.prepare(`DELETE FROM subs WHERE endpoint = ?1`).bind(body.endpoint).run();
  return json({ ok: true });
}

/* ---------- Vue partagée en lecture seule ---------- */
async function getShare(token, env) {
  if (!/^[a-z0-9]{6,64}$/.test(token)) return json({ error: "Lien invalide." }, 400);

  const row = await env.DB.prepare(
    `SELECT space, expires_at FROM shares WHERE token = ?1`
  ).bind(token).first();

  if (!row) return json({ error: "Lien inconnu ou révoqué." }, 404);
  if (row.expires_at && row.expires_at < new Date().toISOString()) {
    return json({ error: "Lien expiré." }, 410);
  }

  /* Uniquement les tâches en cours, jamais les archives ni les notes */
  const rows = await env.DB.prepare(
    `SELECT payload FROM tasks
      WHERE space = ?1 AND deleted = 0 AND archived = 0
      ORDER BY echeance ASC LIMIT 500`
  ).bind(row.space).all();

  const meta = await env.DB.prepare(
    `SELECT columns FROM meta WHERE space = ?1`
  ).bind(row.space).first();

  const tasks = (rows.results || [])
    .map(r => safeParse(r.payload))
    .filter(t => t && t.kind !== "note")
    .map(t => ({                       // on ne renvoie que le strict nécessaire
      id:t.id, date:t.date, sujet:t.sujet, collaboration:t.collaboration,
      objectif:t.objectif, echeance:t.echeance, action:t.action,
      commentaire:t.commentaire, statut:t.statut, tags:t.tags, archived:false
    }));

  return json({ tasks, columns: safeParse(meta && meta.columns) || [] });
}

/* ---------- Ce que le service worker affiche ---------- */
async function rappels(url, env) {
  const space = url.searchParams.get("space");
  if (!isSpace(space)) return json({ error: "Espace invalide." }, 400);

  const settings = await env.DB.prepare(`SELECT settings FROM meta WHERE space = ?1`).bind(space).first();
  const lead = Math.max(0, Math.min(30, Number((safeParse(settings && settings.settings) || {}).lead ?? 1)));

  const limit = new Date(Date.now() + lead * 864e5).toISOString().slice(0, 10);
  const rows = await env.DB.prepare(
    `SELECT payload FROM tasks
      WHERE space = ?1 AND deleted = 0 AND archived = 0
        AND echeance IS NOT NULL AND echeance <> '' AND echeance <= ?2
      ORDER BY echeance ASC LIMIT 50`
  ).bind(space, limit).all();

  const tasks = (rows.results || []).map(r => safeParse(r.payload)).filter(Boolean);
  return json({
    count: tasks.length,
    first: tasks.length ? (tasks[0].sujet || "Tâche sans sujet") : null,
    echeance: tasks.length ? tasks[0].echeance : null
  });
}
