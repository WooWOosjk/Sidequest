"use strict";
(async () => {
  const $ = (id) => document.getElementById(id),
    kind = document.body.dataset.service,
    cfg = window.SERVICES_CONFIG || {},
    status = $("service-status");
  if (cfg.sameOrigin && cfg.portalURL) {
    const portal = new URL(cfg.portalURL);
    portal.pathname = portal.pathname.replace(/\/?$/, "/");
    portal.search = "";
    portal.hash = "";
    for (const a of document.querySelectorAll('a[href]')) {
      if (['index.html', 'web.html', 'chat.html', 'credits.html', 'ai.html', 'proxy.html'].includes(a.getAttribute('href'))) {
        a.href = new URL(a.getAttribute('href'), portal).href;
      }
    }
  }
  function message(text) {
    status.textContent = text;
  }
  function setup() {
    $("service-setup").hidden = false;
    message("Not connected");
  }
  if (!cfg.sameOrigin) {
    setup();
    if (cfg.baseURL) {
      try {
        const url = new URL(cfg.baseURL);
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          )
        )
          throw Error("Use an HTTPS services URL.");
        const a = $("service-launch");
        a.href = new URL(
          kind + ".html",
          url.href.endsWith("/") ? url.href : url.href + "/",
        ).href;
        a.hidden = false;
        message("Open the service to continue.");
      } catch (e) {
        message(e.message);
      }
    }
    return;
  }
  $("service-content").hidden = false;
  message("");
  async function api(path, options) {
    const r = await fetch(path, options);
    let data;
    try {
      data = await r.json();
    } catch {
      throw Error("The services server did not return a response.");
    }
    if (!r.ok) throw Error(data.error || "Service unavailable.");
    return data;
  }
  const node = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  if (kind === "ai") {
    $("ai-form").onsubmit = async (e) => {
      e.preventDefault();
      const text = $("ai-input").value.trim();
      if (!text) return;
      $("ai-send").disabled = true;
      message("Waiting for a reply…");
      $("ai-log").append(node("p", "You: " + text));
      try {
        const data = await api("/api/ai", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        $("ai-log").append(node("p", "AI: " + data.text));
        $("ai-input").value = "";
        message("");
      } catch (e) {
        message(e.message);
      } finally {
        $("ai-send").disabled = false;
      }
    };
  }
  if (kind === "media") {
    let current = null,
      request = 0;
    async function player() {
      if (!current) return;
      message("Loading player…");
      try {
        const data = await api(
          "/api/player?kind=" +
            current.kind +
            "&id=" +
            current.id +
            "&season=" +
            $("season").value +
            "&episode=" +
            $("episode").value,
        );
        const area = $("media-player");
        area.replaceChildren();
        $("watch-link").href = data.watch;
        if (data.embed) {
          const iframe = node("iframe");
          iframe.src = data.embed;
          iframe.title = current.title;
          iframe.allow = "fullscreen";
          iframe.setAttribute("allowfullscreen", "");
          iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms allow-presentation",
          );
          area.append(iframe);
        } else
          area.append(
            node(
              "p",
              "No player is configured. Use “Where to watch” for available services.",
            ),
          );
        message("");
      } catch (e) {
        message(e.message);
      }
    }
    async function browse() {
      const stamp = ++request;
      message("Loading titles…");
      try {
        const data = await api(
          "/api/media?kind=" +
            $("media-kind").value +
            "&search=" +
            encodeURIComponent($("media-query").value),
        );
        if (stamp !== request) return;
        const grid = $("media-results");
        grid.replaceChildren();
        for (const title of data.results) {
          const card = node("article");
          card.className = "game-card";
          const b = node("button");
          b.className = "media-card";
          if (title.poster) {
            const img = node("img");
            img.src = title.poster;
            img.alt = "";
            img.loading = "lazy";
            b.append(img);
          }
          b.append(node("h2", title.title), node("p", title.year));
          b.onclick = () => {
            current = title;
            $("media-title").textContent = title.title;
            $("episode-controls").hidden = title.kind !== "tv";
            $("media-dialog").showModal();
            player();
          };
          card.append(b);
          grid.append(card);
        }
        message(data.results.length ? "" : "No titles found.");
      } catch (e) {
        if (stamp === request) message(e.message);
      }
    }
    $("media-search").onsubmit = (e) => {
      e.preventDefault();
      browse();
    };
    $("media-kind").onchange = browse;
    $("load-episode").onclick = player;
    $("close-media").onclick = () => {
      $("media-player").replaceChildren();
      $("media-dialog").close();
    };
    $("media-dialog").addEventListener("close", () => {
      $("media-player").replaceChildren();
    });
    browse();
  }
  if (kind === "proxy") {
    let controller, connection;
    const script = (src) =>
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(Error("The proxy files could not load."));
        document.head.append(s);
      });
    try {
      await script("/scram/scramjet.all.js");
      await script("/baremux/index.js");
      const { ScramjetController } = window.$scramjetLoadController();
      controller = new ScramjetController({
        prefix: "/scramjet/",
        files: {
          wasm: "/scram/scramjet.wasm.wasm",
          all: "/scram/scramjet.all.js",
          sync: "/scram/scramjet.sync.js",
        },
      });
      await controller.init();
      connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const wisp = new URL("/wisp/", location.href);
      wisp.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      await connection.setTransport("/epoxy/index.mjs", [{ wisp: wisp.href }]);
      message("Ready.");
    } catch (e) {
      message(e.message || "Proxy setup failed.");
    }
    $("proxy-form").onsubmit = (e) => {
      e.preventDefault();
      try {
        if (!controller || !connection)
          throw Error(
            "The proxy is not ready. Reload after checking the service server.",
          );
        let text = $("proxy-url").value.trim();
        if (!/^https?:\/\//i.test(text)) text = "https://" + text;
        const url = new URL(text);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw Error("Enter an HTTP or HTTPS website address.");
        const target = controller.encodeUrl(url.href);
        window.open(target, "_blank", "noopener");
        message("Opened in a new tab. Allow pop-ups if it did not open.");
      } catch (e) {
        message(e.message);
      }
    };
  }
})();
