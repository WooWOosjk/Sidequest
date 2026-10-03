# Movies & TV, AI, and Browser services

Sidequest's game library still runs on a normal static host. The new navigation opens `media.html`, `ai.html`, and `proxy.html`. These pages show setup information until `website/services-config.js` contains your services server's public HTTPS URL. The services operate on a separate origin so the proxy service worker does not control the game library or chat.

## What is included

- Movies/TV: popular titles, search, posters, TV season/episode controls, TMDB watch links, and an optional player URL you have permission to embed.
- AI: plain-text prompt/reply UI, powered by a server-side Groq request. Prompts and replies are not stored. This is a single-prompt assistant; each request has no earlier conversation history.
- Browser: Scramjet/BareMux/Epoxy frontend and a Wisp WebSocket server, adapted from the supplied s0lace project's architecture. Not every website is compatible.
- A Node.js service in `services/`, with all keys in environment variables. No frontend build step.

The original s0lace Gemini key was read from its server environment, and its media page contained someone else's TMDB key. Neither key was reused. You must supply your own credentials. Its default cinema streaming URLs are not included as default players; configure an authorized embed, or use the TMDB “Where to watch” link.

## Try locally

Install Node.js 22+. Open a terminal in the `Sidequest/services` folder:

```sh
npm ci --ignore-scripts
```

Copy `.env.example` to `.env`. Fill in:

```dotenv
HOST=127.0.0.1
PORT=8080
GROQ_API_KEY=your-own-key
GROQ_MODEL=openai/gpt-oss-20b
TMDB_TOKEN=your-own-tmdb-api-read-access-token
```

Then run:

```sh
npm start
```

Open `http://localhost:8080/ai.html`, `/media.html`, or `/proxy.html`. The proxy works on localhost or HTTPS, because service workers require a secure context. On ChromeOS, server administration needs its Linux development environment or a separate computer; visitors only need the hosted site and Chrome.

For static-site development, you may set `baseURL: 'http://localhost:8080/'` in `website/services-config.js`. Production should use HTTPS. The static page opens the server's matching page in a new tab; it does not send passwords or API requests cross-origin.

## Deploy the service

Use a host that supports a persistent Node.js HTTP server **and WebSocket upgrades**, such as your own server or a Node web-service host. A static host and a Firebase callable function cannot run this Wisp server.

Deploy the files **inside `services/`**. Use:

- Node.js 22+
- Install/build command: `npm ci --ignore-scripts`
- Start command: `npm start`
- Environment `HOST=0.0.0.0`
- Provider's `PORT` value
- `SERVICE_USER` and a strong `SERVICE_PASSWORD`
- Your `GROQ_API_KEY`, optional `GROQ_MODEL`, and `TMDB_TOKEN`

The server refuses to listen publicly without a password. HTTPS is necessary before using it remotely. Movies/TV and AI are public: `/media.html`, `/ai.html`, their shared assets, read-only `/api/media` and `/api/player`, and strictly validated `POST /api/ai` requests do not require a login. Status, Browser/proxy assets, Wisp upgrades and other routes retain authentication. SERVICE_USER and SERVICE_PASSWORD are server-side deployment credentials: never share them with visitors or put them in frontend files. There is no visitor account system. Wisp upgrades also require a matching Origin. Reverse proxies must preserve Host, Origin, Authorization and WebSocket upgrade headers. Use an authenticated or TCP health check.

The AI and Movies/TV tabs automatically navigate to the configured service page; Browser keeps its existing explicit launch link. The AI about:blank button loads the public AI page, not a protected service home page.

Once your service has an HTTPS URL, edit `website/services-config.js`:

```js
window.SERVICES_CONFIG = {baseURL: 'https://YOUR-SERVICE-HOST/'};
```

Upload the updated frontend file to your static host. For this Site-hosted Sidequest, send the public URL back so the hosted frontend can be updated. Never send your keys or service password. Deployment and provider billing need to be handled in your accounts; no remote service was deployed during the import.

If you move Sidequest to another host, also update `portalURL` in `services/public/services-config.js` so Games, Web, Chat, and the brand link return to your main site.

## Provider setup

Groq: create your own API key in [Groq Console](https://console.groq.com/keys), then set `GROQ_API_KEY` only in the server environment. Set `GROQ_MODEL` to an available model ID; the default is `openai/gpt-oss-20b`, listed among [Groq production models](https://console.groq.com/docs/models). The server uses the [official OpenAI-compatible chat completions endpoint](https://console.groq.com/docs/api-reference), sends exactly one user message per request, and caps completion tokens at 2048. Provider usage may incur charges. No key belongs in frontend config, Git, responses or logs.

TMDB: create an account at [TMDB](https://www.themoviedb.org/), then Account settings → API to register your application and obtain the **API Read Access Token**. Use that bearer token as `TMDB_TOKEN`, not the old key in the supplied file. Follow [TMDB's API terms and attribution requirements](https://developer.themoviedb.org/docs/faq). The frontend includes the official logo link and required notice. TMDB supplies metadata/watch links, not movie files.

Optional permitted player configuration:

```dotenv
MOVIE_PLAYER_TEMPLATE=https://your-authorized-provider.example/movie/{id}
TV_PLAYER_TEMPLATE=https://your-authorized-provider.example/tv/{id}/{season}/{episode}
```

Those are examples, not working providers. Use only a provider whose embedding terms permit your site. Templates use TMDB IDs. The server requires HTTPS player URLs, and the player always offers a separate watch-link fallback. No movies or episodes are downloaded or mirrored. Live TV from s0lace's external IPTV service is not bundled; deploying this server does not grant access to it.

## Access and maintenance

Public media and AI APIs allow the exact Sidequest frontend origin (`https://sidequest-browser-arcade.friedsocrates.chatgpt.site`), the service's own HTTPS origin, and loopback HTTP for development. They never enable credentialed CORS or `*`. Protected APIs retain their same-origin restriction. If the portal changes domain, update `mediaFrontendOrigin` in server.mjs. AI is limited to 3 requests per rolling minute and 10 per rolling hour per connection IP, plus 60 requests per rolling hour server-wide and 2 concurrent provider calls. AI accepts only POST with application/json (optionally charset=utf-8), an object containing only a nonblank message string of at most 2000 characters, and a body of at most 8192 bytes. Explicit allowed origins are required; CORS preflight permits only POST and Content-Type, with no credentials. Every qualifying AI request consumes its budget before parsing, including malformed requests. Caller-provided Authorization or forwarding headers cannot raise limits. Media searches remain at 30 per minute and player lookups at 60. These service budgets are in-memory and reset on restart; they are separate from the database-enforced chat limits. Use a gateway/account system and shared rate storage before scaling to multiple instances or a large public community. Behind a reverse proxy these limits conservatively share the proxy IP; trusted client-IP forwarding is not enabled (`trustProxy: false`). Render may therefore share an upstream proxy IP across visitors, conservatively sharing the AI budget. The server-wide cap applies even when requests arrive from different IPs. For multiple instances, use shared quotas and a provider-side spend limit; these in-process budgets do not coordinate across instances or survive restarts.

When you deploy the updated source, retain your existing Render environment settings. If Groq is already working, anonymous AI requires no environment-variable changes: keep GROQ_API_KEY, GROQ_MODEL, SERVICE_USER, SERVICE_PASSWORD and all TMDB/player/network settings as they are. For a new installation, set GROQ_API_KEY only on the server; GROQ_MODEL defaults to openai/gpt-oss-20b. This local update does not change Render or deploy anything. Run `npm test` in services/ after `npm ci --ignore-scripts` to verify anonymous media and AI access, strict request validation, origins, limits, redaction, protected endpoints and Wisp handshakes with fixture providers. Tests do not read `.env` or call live Groq/TMDB.

Wisp permits TCP ports 80/443, blocks direct IP destinations, loopback/private IPs and UDP, and limits streams per connection. Do not expose an unauthenticated open proxy. Network controls and authenticated private access are still needed for your deployment. Service credentials should not be shared publicly.

The service and upstream notices are in `services/LICENSE.txt`. The complete editable adapter source is bundled, with a public source-copy link for the AGPL-covered integration; `.env` and node_modules are excluded from the share package. Preserve library licenses when deploying dependencies. Review updates and pin the included lockfile; the imported apps themselves retain their original notices.

## Testing limits

Library paths, representative launch/navigation, favorites/recent/search/filters, responsive layouts, service initialization, provider-response rendering, and credential/rate validation were tested locally. AI and TMDB responses used mock providers because no owner keys were supplied. Live provider account setup, remote service deployment, production passwords, and all third-party game runtimes need live checks after setup. See COLLECTION-ADDITIONS.md for the import inventory.
