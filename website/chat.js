"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    rooms = {
      general: "General",
      games: "Games",
      movies: "Movies",
      books: "Books",
      "off-topic": "Off Topic",
    },
    avatars = {
      controller: "🎮",
      cat: "🐱",
      ghost: "👻",
      robot: "🤖",
      star: "⭐",
      frog: "🐸",
    };
  let auth,
    db,
    fn,
    user,
    role,
    room = "general",
    limit = 60,
    messages = {},
    profiles = {},
    presence = {},
    reply = null,
    connected = false,
    blocked = false,
    query,
    session,
    interval,
    typingTimer,
    pending = false,
    audio,
    offs = [],
    last = {},
    ready = {},
    seenAt = {};
  const cfg = window.CHAT_CONFIG || {},
    read = (k, f) => {
      try {
        return JSON.parse(localStorage.getItem("sidequest:chat:" + k)) ?? f;
      } catch {
        return f;
      }
    },
    save = (k, v) => {
      try {
        localStorage.setItem("sidequest:chat:" + k, JSON.stringify(v));
      } catch {}
    };
  let muted = read("muted", false);
  seenAt = read("read", {});
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const error = (e) => {
    $("chat-error").textContent = e.message || String(e);
    $("chat-error").hidden = false;
  };
  const button = (text, handler, parent) => {
    const b = el("button", text);
    b.type = "button";
    b.onclick = () => Promise.resolve().then(handler).catch(error);
    parent.append(b);
    return b;
  };
  async function call(data) {
    if (!connected) throw Error("You’re offline. Reconnect before sending.");
    if (blocked) throw Error("Your chat access is restricted.");
    return (await fn.httpsCallable("chatAction")(data)).data;
  }
  function watch(ref, event, cb) {
    ref.on(event, cb, error);
    offs.push(() => ref.off(event, cb));
  }
  function sound() {
    if (muted || !audio) return;
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.15);
  }
  document.addEventListener(
    "pointerdown",
    () => {
      try {
        audio = audio || new AudioContext();
        audio.resume();
      } catch {}
    },
    { once: true },
  );
  function muteUI() {
    $("mute").textContent = muted ? "Unmute sound" : "Mute sound";
    $("mute").setAttribute("aria-pressed", String(muted));
  }
  muteUI();
  $("mute").onclick = () => {
    muted = !muted;
    save("muted", muted);
    muteUI();
  };
  function seen() {
    if (!document.hidden) {
      seenAt[room] = Math.max(
        seenAt[room] || 0,
        ...Object.values(messages).map((m) => m.at || 0),
      );
      save("read", seenAt);
      $("room-" + room).querySelector("span").textContent = "";
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) seen();
  });
  function status() {
    const now = Date.now(),
      users = new Set(),
      typing = new Set();
    for (const [uid, sessions] of Object.entries(presence))
      for (const s of Object.values(sessions || {}))
        if (now - s.at < 75000) {
          users.add(uid);
          if (
            uid !== user?.uid &&
            s.room === room &&
            s.typing &&
            now - s.at < 7000
          )
            typing.add(profiles[uid]?.name || "Guest");
        }
    $("online").replaceChildren(
      ...[...users].map((uid) =>
        el(
          "li",
          (avatars[profiles[uid]?.avatar] || "🎮") +
            " " +
            (profiles[uid]?.name || "Guest"),
        ),
      ),
    );
    $("online-count").textContent = users.size;
    $("typing").textContent = typing.size
      ? [...typing].slice(0, 3).join(", ") +
        (typing.size === 1 ? " is typing…" : " are typing…")
      : "";
  }
  function presenceUpdate(typing = false) {
    if (session && connected && !blocked)
      return session
        .set({ room, at: firebase.database.ServerValue.TIMESTAMP, typing })
        .catch(error);
  }
  async function moderate(uid, mode) {
    if (
      confirm(
        mode === "ban"
          ? "Ban this account?"
          : "Kick this account for 15 minutes?",
      )
    ) {
      await call({ action: "moderate", uid, mode });
      Arcade.toast("Done.");
    }
  }
  function render() {
    const log = $("messages"),
      bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 90,
      scroll = log.scrollTop;
    log.replaceChildren();
    const entries = Object.entries(messages).sort((a, b) => a[1].at - b[1].at);
    if (!entries.length) log.append(el("p", "No messages yet.", "muted"));
    for (const [id, m] of entries) {
      const row = el("article", undefined, "message");
      row.dataset.id = id;
      row.append(el("span", avatars[m.avatar] || "🎮", "avatar"));
      const body = el("div"),
        head = el("div", undefined, "message-head");
      head.append(el("strong", m.name));
      const time = el(
        "time",
        new Date(m.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      time.dateTime = new Date(m.at).toISOString();
      time.title = new Date(m.at).toLocaleString();
      head.append(time);
      if (m.editedAt && !m.deleted) head.append(el("small", "edited"));
      body.append(head);
      if (m.reply) {
        const original = messages[m.reply];
        body.append(
          el(
            "div",
            original && !original.deleted
              ? original.name + ": " + original.text.slice(0, 140)
              : "Reply to an earlier or deleted message",
            "quoted",
          ),
        );
      }
      body.append(
        el("p", m.deleted ? "Message deleted" : m.text, "message-text"),
      );
      if (!m.deleted) {
        const actions = el("div", undefined, "message-actions");
        button(
          "Reply",
          () => {
            reply = id;
            $("reply-bar").hidden = false;
            $("reply-bar").querySelector("span").textContent =
              "Replying to " + m.name;
            $("message-input").focus();
          },
          actions,
        );
        for (const [key, label] of Object.entries({
          like: "👍",
          heart: "❤️",
          laugh: "😂",
        })) {
          const count = Object.keys(m.reactions?.[key] || {}).length,
            b = button(
              label + (count ? " " + count : ""),
              () => call({ action: "react", room, id, reaction: key }),
              actions,
            );
          b.setAttribute("aria-label", key + " reaction");
          b.setAttribute(
            "aria-pressed",
            String(!!m.reactions?.[key]?.[user.uid]),
          );
        }
        if (m.uid === user.uid)
          button(
            "Edit",
            async () => {
              const text = prompt("Edit message", m.text);
              if (text !== null) await call({ action: "edit", room, id, text });
            },
            actions,
          );
        if (m.uid === user.uid || role)
          button(
            "Delete",
            async () => {
              if (confirm("Delete this message?"))
                await call({ action: "delete", room, id });
            },
            actions,
          );
        button(
          "Report",
          async () => {
            const reason = prompt("Why are you reporting this message?");
            if (reason) {
              await call({ action: "report", room, id, reason });
              Arcade.toast("Report sent.");
            }
          },
          actions,
        );
        if (role && m.uid !== user.uid) {
          button("Kick", () => moderate(m.uid, "kick"), actions);
          button("Ban", () => moderate(m.uid, "ban"), actions);
        }
        body.append(actions);
      }
      row.append(body);
      log.append(row);
    }
    log.scrollTop = bottom ? log.scrollHeight : scroll;
    seen();
  }
  function attach() {
    if (query) query.off();
    query = db
      .ref("messages/" + room)
      .orderByChild("at")
      .limitToLast(limit);
    query.on(
      "value",
      (s) => {
        messages = s.val() || {};
        $("older").hidden =
          Object.keys(messages).length < limit || limit >= 600;
        render();
      },
      error,
    );
  }
  function switchRoom(id) {
    seen();
    room = id;
    limit = 60;
    reply = null;
    $("reply-bar").hidden = true;
    messages = {};
    for (const k of Object.keys(rooms))
      $("room-" + k).setAttribute("aria-current", String(k === room));
    $("room-title").textContent = "# " + rooms[room];
    $("messages").replaceChildren(el("p", "Loading messages…", "muted"));
    if (db && user && !blocked) {
      attach();
      presenceUpdate();
    }
    status();
  }
  for (const [id, name] of Object.entries(rooms)) {
    const b = el("button", "# " + name, "room");
    b.id = "room-" + id;
    b.type = "button";
    b.append(el("span", "", "unread"));
    b.onclick = () => switchRoom(id);
    $("rooms").append(b);
  }
  $("room-general").setAttribute("aria-current", "true");
  $("older").onclick = () => {
    limit = Math.min(600, limit + 60);
    attach();
  };
  $("cancel-reply").onclick = () => {
    reply = null;
    $("reply-bar").hidden = true;
  };
  let lastTyping = 0;
  $("message-input").oninput = () => {
    $("characters").textContent = $("message-input").value.length + " / 1000";
    clearTimeout(typingTimer);
    if (Date.now() - lastTyping > 2000) {
      presenceUpdate(true);
      lastTyping = Date.now();
    }
    typingTimer = setTimeout(() => presenceUpdate(false), 3500);
  };
  $("message-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("compose").requestSubmit();
    }
  };
  $("compose").onsubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    pending = true;
    $("send").disabled = true;
    $("chat-error").hidden = true;
    try {
      await call({
        action: "send",
        room,
        text: $("message-input").value,
        reply,
      });
      $("message-input").value = "";
      $("characters").textContent = "0 / 1000";
      reply = null;
      $("reply-bar").hidden = true;
      presenceUpdate(false);
    } catch (e) {
      error(e);
    } finally {
      pending = false;
      $("send").disabled = !connected || blocked;
    }
  };
  $("profile-button").onclick = () => {
    $("profile-dialog").showModal();
  };
  $("close-profile").onclick = () => {
    $("profile-dialog").close();
  };
  $("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await call({
        action: "profile",
        name: $("username").value,
        avatar: $("avatar").value,
      });
      $("profile-status").textContent = "Saved.";
      $("profile-dialog").close();
    } catch (e) {
      $("profile-status").textContent = e.message;
    }
  };
  $("account-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (e.submitter.value === "register") {
        await user.linkWithCredential(
          firebase.auth.EmailAuthProvider.credential(
            $("email").value,
            $("password").value,
          ),
        );
        await user.sendEmailVerification();
        $("profile-status").textContent =
          "Account created. Check your email to verify it.";
      } else {
        await auth.signInWithEmailAndPassword(
          $("email").value,
          $("password").value,
        );
        $("profile-status").textContent = "Signed in.";
      }
      $("password").value = "";
      $("identity").textContent = "Account: " + auth.currentUser.email;
    } catch (e) {
      $("profile-status").textContent = e.message;
    }
  };
  $("reset-password").onclick = async () => {
    try {
      await auth.sendPasswordResetEmail($("email").value);
      $("profile-status").textContent = "Password reset email sent.";
    } catch (e) {
      $("profile-status").textContent = e.message;
    }
  };
  $("sign-out").onclick = async () => {
    if (
      confirm(
        "Sign out? Guest profiles cannot be recovered without an account.",
      )
    ) {
      await auth.signOut();
      $("profile-dialog").close();
    }
  };
  $("close-reports").onclick = () => {
    $("reports-dialog").close();
  };
  $("moderation-button").onclick = async () => {
    try {
      const reports = (await db.ref("reports").get()).val() || {},
        container = $("reports");
      container.replaceChildren();
      for (const [r, items] of Object.entries(reports))
        for (const [id, values] of Object.entries(items))
          for (const report of Object.values(values)) {
            const item = el("div", undefined, "report");
            item.append(
              el(
                "p",
                rooms[r] +
                  " · " +
                  id +
                  "\n" +
                  report.reason +
                  "\nAccount: " +
                  report.messageUid,
              ),
            );
            const message = (
              await db.ref("messages/" + r + "/" + id).get()
            ).val();
            item.append(el("p", message?.text || "Message deleted"));
            button(
              "Delete message",
              () => call({ action: "delete", room: r, id }),
              item,
            );
            button(
              "Kick account",
              () => moderate(report.messageUid, "kick"),
              item,
            );
            button(
              "Ban account",
              () => moderate(report.messageUid, "ban"),
              item,
            );
            button(
              "Unban account",
              () =>
                call({
                  action: "moderate",
                  uid: report.messageUid,
                  mode: "unban",
                }),
              item,
            );
            container.append(item);
          }
      if (!container.childNodes.length)
        container.append(el("p", "No reports."));
      $("reports-dialog").showModal();
    } catch (e) {
      error(e);
    }
  };
  function cleanup() {
    offs.forEach((off) => off());
    offs = [];
    if (query) query.off();
    query = null;
    clearInterval(interval);
    if (session) session.remove().catch(() => {});
    session = null;
  }
  if (!cfg.firebase) {
    $("setup").hidden = false;
    $("connection").textContent = "Not configured";
    $("profile-button").disabled = true;
    return;
  }
  if (!window.firebase) {
    error(
      Error(
        "Firebase could not load. Check your internet connection and reload.",
      ),
    );
    return;
  }
  try {
    firebase.initializeApp(cfg.firebase);
    auth = firebase.auth();
    db = firebase.database();
    fn = firebase.app().functions(cfg.region || "us-central1");
    if (cfg.emulator) {
      if (!["localhost", "127.0.0.1"].includes(location.hostname))
        throw Error("Emulators are restricted to localhost.");
      auth.useEmulator("http://127.0.0.1:9099");
      db.useEmulator("127.0.0.1", 9000);
      fn.useEmulator("127.0.0.1", 5001);
    }
    auth.onAuthStateChanged(async (current) => {
      cleanup();
      user = current;
      role = null;
      messages = {};
      profiles = {};
      presence = {};
      ready = {};
      last = {};
      blocked = false;
      $("chat-error").hidden = true;
      if (!current) {
        try {
          await auth.signInAnonymously();
        } catch (e) {
          error(e);
          $("connection").textContent = "Sign-in failed";
        }
        return;
      }
      $("chat-layout").hidden = false;
      $("identity").textContent =
        (current.isAnonymous ? "Guest" : "Account: " + current.email) +
        " · ID " +
        current.uid;
      watch(db.ref("access/" + current.uid), "value", (s) => {
        const v = s.val() || {};
        blocked = !!v.banned || v.kickedUntil > Date.now();
        $("send").disabled = blocked || !connected;
        $("message-input").disabled = blocked;
        if (blocked) {
          if (query) query.off();
          query = null;
          $("messages").replaceChildren();
          error(
            Error(
              v.banned
                ? "This account is banned."
                : "You have been kicked for 15 minutes.",
            ),
          );
          if (session) session.remove().catch(() => {});
        } else if (connected && !query) attach();
      });
      watch(db.ref("roles/" + current.uid), "value", (s) => {
        role = ["admin", "moderator"].includes(s.val()) ? s.val() : null;
        $("moderation-button").hidden = !role;
        if (Object.keys(messages).length) render();
      });
      watch(db.ref("profiles"), "value", (s) => {
        profiles = s.val() || {};
        const p = profiles[current.uid];
        if (p) {
          $("username").value = p.name;
          $("avatar").value = p.avatar;
        } else if (!$("profile-dialog").open) {
          $("username").value = "Guest-" + current.uid.slice(-4);
          $("profile-dialog").showModal();
        }
        status();
      });
      watch(db.ref("presence"), "value", (s) => {
        presence = s.val() || {};
        status();
      });
      for (const id of Object.keys(rooms)) {
        watch(
          db
            .ref("messages/" + id)
            .orderByChild("at")
            .limitToLast(100),
          "value",
          (s) => {
            const values = Object.values(s.val() || {}),
              latest = Math.max(0, ...values.map((m) => m.at || 0));
            if (!ready[id] && seenAt[id] === undefined) {
              seenAt[id] = latest;
              save("read", seenAt);
            }
            const count = values.filter(
              (m) => m.at > (seenAt[id] || 0) && m.uid !== current.uid,
            ).length;
            $("room-" + id).querySelector("span").textContent = count
              ? String(count)
              : "";
            if (
              ready[id] &&
              count &&
              latest > (last[id] || 0) &&
              (room !== id || document.hidden)
            )
              sound();
            ready[id] = true;
            last[id] = latest;
          },
        );
      }
      session = db.ref("presence/" + current.uid).push();
      watch(db.ref(".info/connected"), "value", async (s) => {
        connected = s.val() === true;
        $("connection").textContent = connected
          ? "Online"
          : "Offline · reconnecting…";
        $("send").disabled = !connected || blocked;
        if (connected && !blocked) {
          try {
            await session.onDisconnect().remove();
            await presenceUpdate();
            if (!query) attach();
          } catch (e) {
            error(e);
          }
        }
      });
      interval = setInterval(() => {
        presenceUpdate(false);
        status();
        if (blocked)
          db.ref("access/" + current.uid)
            .get()
            .then((s) => {
              const v = s.val() || {};
              if (!v.banned && !(v.kickedUntil > Date.now())) location.reload();
            })
            .catch(() => {});
      }, 25000);
      switchRoom(room);
    }, error);
  } catch (e) {
    error(e);
    $("connection").textContent = "Connection failed";
  }
})();
