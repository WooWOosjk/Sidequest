import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
const host = process.env.HOST || "127.0.0.1",
  password = process.env.SERVICE_PASSWORD;
if (!["127.0.0.1", "localhost", "::1"].includes(host) && !password)
  throw Error("Set SERVICE_PASSWORD before exposing the service publicly.");
const expected = Buffer.from(
  "Basic " +
    Buffer.from(
      (process.env.SERVICE_USER || "sidequest") + ":" + password,
    ).toString("base64"),
);
function authorized(req) {
  if (!password) return true;
  const supplied = Buffer.from(req.headers.authorization || "");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}
// Only the Movies/TV page, its shared assets, and read-only media APIs are public.
// Exact paths avoid granting anonymous access to AI, proxy assets, or source routes.
const publicMediaAssets = new Set([
  "/media.html", "/styles.css", "/gamer.css", "/services.css",
  "/common.js", "/blank.js", "/services-config.js", "/services.js",
]);
const publicMediaApis = new Set(["/api/media", "/api/player"]);
const mediaFrontendOrigin = "https://sidequest-browser-arcade.friedsocrates.chatgpt.site";
function mediaOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin || origin === mediaFrontendOrigin) return true;
  if (origin === "https://" + req.headers.host) return true;
  // HTTP is accepted only for local development, not a production downgrade.
  return ["localhost", "127.0.0.1", "[::1]"].some(
    (name) => req.headers.host === name || req.headers.host?.startsWith(name + ":"),
  ) && origin === "http://" + req.headers.host;
}
Object.assign(wisp.options, {
  allow_udp_streams: false,
  allow_private_ips: false,
  allow_loopback_ips: false,
  allow_direct_ip: false,
  port_whitelist: [80, 443],
  stream_limit_total: 24,
  stream_limit_per_host: -1,
});
logging.set_level(logging.NONE);
const app = Fastify({
  bodyLimit: 40000,
  serverFactory: (handler) =>
    createServer(handler).on("upgrade", (req, socket, head) => {
      if (req.url === "/wisp/" && authorized(req) && sameOrigin(req))
        wisp.routeRequest(req, socket, head);
      else socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }),
});
app.addHook("onRequest", async (req, res) => {
  const path = req.url.split("?", 1)[0];
  const read = req.method === "GET" || req.method === "HEAD";
  const mediaApi = publicMediaApis.has(path) && (read || req.method === "OPTIONS");
  const publicMedia = mediaApi || (read && publicMediaAssets.has(path));
  if (!publicMedia && !authorized(req.raw))
    return res
      .header("WWW-Authenticate", 'Basic realm="Sidequest services"')
      .code(401)
      .send("Sign in to use this service.");
  const origin = req.headers.origin;
  if (mediaApi && !mediaOriginAllowed(req.raw))
    return res.code(403).send({ error: "Request origin is not allowed." });
  if (!mediaApi && req.url.startsWith("/api/") && !sameOrigin(req.raw))
    return res.code(403).send({ error: "Request origin is not allowed." });
  if (mediaApi) {
    res.header("Vary", "Origin");
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    // Public metadata never needs browser credentials or authorization headers.
    if (req.method === "OPTIONS")
      return res.header("Access-Control-Allow-Methods", "GET, HEAD").code(204).send();
  }
  res.header("X-Content-Type-Options", "nosniff");
  if (
    req.url.startsWith("/proxy.html") ||
    req.url.startsWith("/scram/") ||
    req.url.startsWith("/epoxy/") ||
    req.url.startsWith("/baremux/")
  )
    res
      .header("Cross-Origin-Opener-Policy", "same-origin")
      .header("Cross-Origin-Embedder-Policy", "require-corp");
});
app.register(staticPlugin, {
  root: fileURLToPath(new URL("./public/", import.meta.url)),
});
app.register(staticPlugin, {
  root: scramjetPath,
  prefix: "/scram/",
  decorateReply: false,
});
app.register(staticPlugin, {
  root: epoxyPath,
  prefix: "/epoxy/",
  decorateReply: false,
});
app.register(staticPlugin, {
  root: baremuxPath,
  prefix: "/baremux/",
  decorateReply: false,
});
const budgets = new Map();
function rate(req, kind, maximum) {
  const key = req.ip + ":" + kind,
    now = Date.now();
  let v = budgets.get(key);
  if (!v || now - v.at > 60000) v = { at: now, count: 0 };
  v.count++;
  budgets.set(key, v);
  if (budgets.size > 10000)
    for (const [k, x] of budgets) if (now - x.at > 60000) budgets.delete(k);
  return v.count <= maximum;
}
app.get("/api/status", async () => ({
  ai: !!process.env.GROQ_API_KEY,
  media: !!process.env.TMDB_TOKEN,
  proxy: true,
}));
app.post("/api/ai", async (req, res) => {
  if (!rate(req, "ai", 8))
    return res
      .code(429)
      .send({ error: "Wait a minute before sending more messages." });
  if (!process.env.GROQ_API_KEY)
    return res
      .code(503)
      .send({ error: "AI needs GROQ_API_KEY on the service server." });
  const text = req.body?.message;
  if (typeof text !== "string" || !text.trim() || text.length > 8000)
    return res
      .code(400)
      .send({ error: "Enter a message of 1–8000 characters." });
  try {
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(model)) throw Error("Invalid model");
    const r = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.GROQ_API_KEY,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: text.trim() }],
          max_completion_tokens: 2048,
          stream: false,
        }),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!r.ok)
      return res
        .code(502)
        .send({
          error:
            "The AI provider could not complete the request. Check the server’s key and model.",
        });
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    return {
      text: typeof content === "string" && content
        ? content.replaceAll(process.env.GROQ_API_KEY, "[redacted]")
        : "No response was returned.",
    };
  } catch {
    return res
      .code(502)
      .send({ error: "The AI service is unavailable. Try again later." });
  }
});
app.get("/api/media", async (req, res) => {
  if (!rate(req, "media", 30))
    return res
      .code(429)
      .send({ error: "Too many searches. Try again in a minute." });
  if (!process.env.TMDB_TOKEN)
    return res
      .code(503)
      .send({
        error: "Movies & TV needs your own TMDB_TOKEN on the service server.",
      });
  const kind = req.query.kind === "tv" ? "tv" : "movie",
    search = String(req.query.search || "").trim();
  if (search.length > 100)
    return res.code(400).send({ error: "Use a shorter search." });
  const endpoint = search ? `search/${kind}` : `${kind}/popular`,
    url = new URL("https://api.themoviedb.org/3/" + endpoint);
  url.searchParams.set("include_adult", "false");
  if (search) url.searchParams.set("query", search);
  try {
    const r = await fetch(url, {
      headers: { Authorization: "Bearer " + process.env.TMDB_TOKEN },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      return res
        .code(502)
        .send({ error: "TMDB is unavailable or its token is invalid." });
    const data = await r.json();
    return {
      results: (data.results || [])
        .filter((m) => !m.adult)
        .map((m) => ({
          id: m.id,
          title: m.title || m.name,
          poster: m.poster_path
            ? "https://image.tmdb.org/t/p/w342" + m.poster_path
            : null,
          year: (m.release_date || m.first_air_date || "").slice(0, 4),
          overview: m.overview || "",
          kind,
        })),
    };
  } catch {
    return res
      .code(502)
      .send({ error: "Could not reach TMDB. Try again later." });
  }
});
app.get("/api/player", async (req, res) => {
  if (!rate(req, "player", 60))
    return res.code(429).send({ error: "Too many player requests. Try again in a minute." });
  const kind = req.query.kind === "tv" ? "tv" : "movie",
    id = String(req.query.id || ""),
    season = String(req.query.season || "1"),
    episode = String(req.query.episode || "1");
  if (
    !/^\d{1,9}$/.test(id) ||
    !/^\d{1,4}$/.test(season) ||
    !/^\d{1,4}$/.test(episode)
  )
    return res.code(400).send({ error: "Invalid title or episode." });
  const template =
    process.env[kind === "tv" ? "TV_PLAYER_TEMPLATE" : "MOVIE_PLAYER_TEMPLATE"];
  if (!template)
    return {
      embed: null,
      watch: `https://www.themoviedb.org/${kind}/${id}/watch`,
    };
  try {
    const url = new URL(
      template
        .replaceAll("{id}", id)
        .replaceAll("{season}", season)
        .replaceAll("{episode}", episode),
    );
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Invalid provider");
    return {
      embed: url.href,
      watch: `https://www.themoviedb.org/${kind}/${id}/watch`,
    };
  } catch {
    return res
      .code(503)
      .send({
        error: "The configured player URL must be a valid HTTPS address.",
      });
  }
});
app.options("/api/media", async (_req, res) => res.code(204).send());
app.options("/api/player", async (_req, res) => res.code(204).send());
app.setNotFoundHandler((req, res) =>
  res.code(404).send({ error: "Page not found." }),
);
const stop = () => app.close().then(() => process.exit());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app
  .listen({ host, port: Number(process.env.PORT || 8080) })
  .then(() =>
    console.log(
      "Sidequest services listening on " +
        host +
        ":" +
        (process.env.PORT || 8080),
    ),
  );
