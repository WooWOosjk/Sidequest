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

The server refuses to listen publicly without a password. HTTPS is necessary before using it remotely. Movies/TV is public: `/media.html`, its required assets, and read-only `/api/media` and `/api/player` requests do not require a login. Everything else, including AI, status, Browser/proxy assets and Wisp upgrades, retains authentication. SERVICE_USER and SERVICE_PASSWORD are server-side deployment credentials: never share them with visitors or put them in frontend files. There is no visitor account system. Wisp upgrades also require a matching Origin. Reverse proxies must preserve Host, Origin, Authorization and WebSocket upgrade headers. Use an authenticated or TCP health check.

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

Public media APIs allow the exact Sidequest frontend origin (`https://sidequest-browser-arcade.friedsocrates.chatgpt.site`), the service's own HTTPS origin, and loopback HTTP for development. They never enable credentialed CORS or `*`. Protected APIs retain their same-origin restriction. If the portal changes domain, update `mediaFrontendOrigin` in server.mjs. AI is limited to eight requests per IP per minute, media searches to 30, player lookups to 60, and prompts to 8000 characters. These service budgets are in-memory and reset on restart; they are separate from the database-enforced chat limits. Use a gateway/account system and shared rate storage before scaling to multiple instances or a large public community. Behind a reverse proxy these limits conservatively share the proxy IP; trusted client-IP forwarding is not enabled by this patch.

After updating the service source, redeploy the Render service after adding `GROQ_API_KEY` and optionally `GROQ_MODEL=openai/gpt-oss-20b` in Render’s environment settings. Remove `GEMINI_API_KEY` and `GEMINI_MODEL`; leave service authentication, TMDB, player and networking variables unchanged. This local migration does not change Render or deploy anything. Run `npm test` in services/ after `npm ci --ignore-scripts` to verify anonymous media access, origin restrictions, limits, protected endpoints and Wisp handshakes with fixture providers. Tests do not read `.env` or call live Groq/TMDB.

Wisp permits TCP ports 80/443, blocks direct IP destinations, loopback/private IPs and UDP, and limits streams per connection. Do not expose an unauthenticated open proxy. Network controls and authenticated private access are still needed for your deployment. Service credentials should not be shared publicly.

The service and upstream notices are in `services/LICENSE.txt`. The complete editable adapter source is bundled, with a public source-copy link for the AGPL-covered integration; `.env` and node_modules are excluded from the share package. Preserve library licenses when deploying dependencies. Review updates and pin the included lockfile; the imported apps themselves retain their original notices.

## Testing limits

Library paths, representative launch/navigation, favorites/recent/search/filters, responsive layouts, service initialization, provider-response rendering, and credential/rate validation were tested locally. AI and TMDB responses used mock providers because no owner keys were supplied. Live provider account setup, remote service deployment, production passwords, and all third-party game runtimes need live checks after setup. See COLLECTION-ADDITIONS.md for the import inventory.
