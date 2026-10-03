# Sidequest

A standalone vanilla HTML/CSS/JavaScript game portal rebuilt from the user-supplied Noahs-Calculus-Tutor-master catalog, games, and thumbnails. Includes 424 catalog entries: 409 local launch pages and 15 external links. The original download is unchanged. The new portal design uses its own Sidequest branding.

Import basis: the user stated that the collection creator permits reuse with credit. Underlying game and asset rights were not independently verified. Original game files and notices are preserved byte-for-byte. Read `website/credits.html`, `website/COLLECTION-README.md`, and `website/COLLECTION-LICENSE.txt`. The portal's MIT LICENSE applies to the newly authored portal and original demos, not imported games or images.

## Structure

- `website/index.html`: library
- `website/player.html`: player
- `website/styles.css`: responsive dark theme
- `website/gamer.css`: arcade palette, bold typography, compact cards, and casual portal styling
- `website/games.js`: the only catalog you edit to add games
- `website/common.js`: storage, random selection, URL validation, close warning
- `website/library.js`, `website/player.js`: page behavior
- `website/assets/`: original demo thumbnails and missing-image fallback
- `website/images/`: 423 imported thumbnails
- `website/games/collection/`: 409 supplied game launch pages
- `website/games/`: original demos retained as optional files and future local games
- `website/credits.html`: collection attribution and permission notes
- `website/web.html`: Web tab wrapper with portal navigation
- `website/web/index.html`: user-supplied GUST Browser, preserved byte-for-byte
- `website/web.js`: Web frame loading state
- `.openai/hosting.json`: optional Sites deployment configuration

## Run locally

For Chromebook use, extract the whole folder and open START.html in Chrome. Local-file mode skips the fetch precheck for local games. Some imported runtimes still require hosting. For development, serve the website folder over HTTP. From this folder, with Python installed: `python -m http.server 8080 --directory website`. Visit http://localhost:8080. Any static development server works. There is no build, package installation, framework, or server-side app.

## Add a game

Add one object to the `window.GAMES` array in `website/games.js`:

```js
{ id: 'my-game', title: 'My Game', category: 'Arcade',
  thumbnail: 'assets/my-game.webp', type: 'local',
  source: 'games/my-game/index.html', description: 'A short description.',
  controls: 'Arrow keys to move', license: 'License / permission details' }
```

IDs must be unique and stable. Categories are generated automatically from the catalog's category fields. Imported categories were inferred and can be edited. Supported types: `local`, `iframe`, `external`. Set `demo: true` only for demos. Data is rendered as text, not injected HTML. Use HTTP(S) URLs only. Entries without usable local files are external links to their supplied catalog destinations; these are not claimed to be official publisher URLs. No external entry is silently embedded.

The Minecraft 1.12.1 launch page is over 32 MB and remains an external link. Fruit Merge references a missing `220.html` and also remains a source link. The other external entries already pointed outside the local games folder. Some supplied local launchers depend on third-party CDNs and may fail if those dependencies change or block access. Importing launch pages does not make their remote dependencies offline.

## Thumbnails

Place your own or properly licensed thumbnail in `website/assets` and reference its relative path. WebP, PNG, JPEG, and SVG work. Use approximately 640×400 for the compact 16:10 cards. Missing thumbnails fall back to the title. Included SVG thumbnails visualize the original demo playfields.

## Local games

Copy the complete permitted HTML5 game folder into `website/games/my-game/`, retaining its relative assets. `type: 'local'` prechecks that its source returns HTML, then opens it in an iframe. It must be on the same origin. Keep required license notices and attribution. Add new games only when you own them or have redistribution permission. Frames allow scripts, same-origin resources, pointer lock, and fullscreen. Same-origin sandboxed games must be trusted: this is not an isolation boundary for untrusted code. Games requiring special APIs may need deliberate player permission changes.

## Permitted embeds and external links

For an officially permitted embed, use `type: 'iframe'` and the provider's exact HTTPS embed URL. Follow its terms and attribution. Providers can refuse embeds through CSP or X-Frame-Options. Browsers do not reliably expose cross-origin embed failures; the player supplies an official source link and a load timeout, but a load event cannot prove the game rendered. Do not proxy, strip headers, or bypass restrictions. When embedding is not permitted, use `type: 'external'` with the official game URL. It opens via an explicit button in a new tab. Recently played records external games when that button is used.

## Storage and close confirmation

Favorites and the last 20 games are kept on this browser in localStorage; they do not sync across devices. Unavailable storage falls back to in-memory state with a notice. Browser restrictions may prevent persistence in private modes.

`beforeunload` requests the native confirmation on tab close, reload, or leaving the site. Browsers choose the text (custom “Are you sure?” wording is not allowed), normally require a prior user interaction, and may omit it on mobile or forced shutdown. Internal portal links bypass it. It cannot be guaranteed on every device and is not an unsaved-progress system.

## Static deployment

Upload everything **inside `website`** to the public root of any normal static host (GitHub Pages, Netlify, Cloudflare Pages, or another HTTPS host). No rewrite rules or build command are needed. The relative URLs also support subdirectory deployment. Keep `player.html`, scripts, assets, and game folders together. Do not upload work files or credentials. Sites configuration outside `dist` is optional and not required on other hosts.

## Web tab

The top navigation includes Games and Web. Web loads the supplied `C:\Users\jayne\Downloads\index.html` as `website/web/index.html` inside a dedicated frame; its built-in branding and notices are preserved. A separate-tab fallback is available. The import relies on the user's stated redistribution permission. The embedded browser may need network access to its original libraries and services. Adding this tab does not configure those services or guarantee that every remote website works inside GUST.

## Checks

See TEST-REPORT.md for the completed checks and browser limitations. Search shortcut: `/`. All library actions are keyboard accessible; Snake also supplies touch controls.




## Native chat

Chat uses a separate Firebase backend with plain frontend files. Follow [CHAT-SETUP.md](CHAT-SETUP.md) for exact Console steps, permissions, deployment, roles, and tests. The rest of the portal remains static. The supplied chat-config.js intentionally has no production project credentials.

## Additional collections and services

See COLLECTION-ADDITIONS.md for the 272 additions and preserved source credits. The Movies & TV, AI, and Browser tabs need the separate services/ server described in SERVICES-SETUP.md. Keep its keys in server environment variables.
