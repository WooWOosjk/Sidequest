# Development changelog

Local notes for Sidequest work that is not a public release. No secrets belong in this file.

## 2026-11-05

Approved audit items 2, 3, 4, and 5. No games were removed. The services password, Wisp checks, origin checks, and private-address/port blocks were not changed. Nothing was deployed.

### Services navigation

`services/public/services.js` no longer rewrites the AI or Browser tabs to the static portal. Those tabs stay on the services host, so the working AI page does not send people to the login-walled game host. Games, Web, Chat, and credits still point at the portal. `website/services.js` uses the same `PORTAL_PAGES` list and the same portal URL cleanup. Movies and AI on the static site still redirect to the services host.

### Browser sign-in

The Browser page explains that the proxy requires the operator username and password before the visitor continues. The button is labeled “Continue to Browser” and opens the services Browser URL in the same tab, where the existing HTTP basic-auth challenge still runs. The page does not store or send the password. Games, Movies, and AI stay usable without that sign-in.

### Unavailable games

Eight launchers that were confirmed dead stay in the catalog and are marked `broken`, with a reason:

- PEAK: jsDelivr loader returned 404
- Spaceflight Simulator and OvO: the file is a missing-file notice
- Jelly Drift, BloodMoney, Generic Fighter Maybe, WebFishing, and Flappy Bird: jsDelivr loader returned 403

The library badges them UNAVAILABLE, lists them after games that can launch, and still links to the player. The player shows a failed state with Back to games and Random game when an entry is marked unavailable, when the launch file is an error notice, when a `<base href>` loader returns 404 or 403, or when the frame does not finish loading. Random skips unavailable games when another game exists.

### Tab bar

Below 1100px the site tabs wrap onto their own full-width row on every page that uses `gamer.css`, including the services copy. A tab is no longer clipped at 768px or 390px.

### Checks

`node --test tests/catalog-nav.test.mjs` covers the portal link list, the Browser copy, the eight marked games, and launch-file detection. `node --test tests/portal-ui.test.mjs` checks tab fit at 1440, 768, and 390 and the OvO and PEAK failed states in headless Chrome. `npm test` in `services/` is unchanged and still covers auth and rate limits.

## 2026-11-05 — Silver and black hub

The purple and green arcade skin is replaced by one silver-and-black design system in `website/styles.css`. `gamer.css`, `chat.css`, and `services.css` use those tokens, and the same files are copied into `services/public/`.

The library keeps search, categories, favorites, recently played, all 696 games, and the Unavailable badges. A featured row shows one working game from each category. Movies show the overview and put the TMDB “Where to watch” link first when no embed is configured.

Security controls, rate limits, and environment variables were not changed. The reference for layout was Noah’s Tutoring Hub (`https://www.noahstutoring.academy/`): a dark hub with persistent navigation, a prominent search, and a game grid. Its name, logo, copy, and assets were not copied. The accent here is brushed silver, not that site’s orange.
