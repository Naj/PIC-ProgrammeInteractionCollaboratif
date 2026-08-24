/* Génère la paire de clés VAPID nécessaire aux notifications.
   Usage :  node tools/generate-vapid.mjs
   Node 18+ requis (WebCrypto natif). */

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
);

const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw  = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

const b64url = bytes => Buffer.from(bytes).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log("\n── Clés VAPID pour PIC ─────────────────────────────\n");
console.log("VAPID_PUBLIC (à mettre aussi dans les variables Pages) :");
console.log(b64url(raw));
console.log("\nVAPID_JWK (secret du worker, une seule ligne) :");
console.log(JSON.stringify({ d: priv.d, x: priv.x, y: priv.y }));
console.log("\nVAPID_SUBJECT :");
console.log("mailto:votre@adresse");
console.log("\n────────────────────────────────────────────────────\n");
console.log("Commandes :");
console.log("  cd worker-rappels");
console.log("  npx wrangler secret put VAPID_PUBLIC");
console.log("  npx wrangler secret put VAPID_JWK");
console.log("  npx wrangler secret put VAPID_SUBJECT");
console.log("  npx wrangler secret put CRON_TEST_KEY\n");
