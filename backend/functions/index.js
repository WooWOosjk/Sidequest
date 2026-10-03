"use strict";
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
// The demo CLI's function config uses a legacy namespace; match the rules emulator's default instance.
const db =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? require("firebase-admin/database").getDatabaseWithUrl(
        `https://${process.env.GCLOUD_PROJECT}-default-rtdb.firebaseio.com`,
      )
    : admin.database();
const rooms = ["general", "games", "movies", "books", "off-topic"];
const avatars = ["controller", "cat", "ghost", "robot", "star", "frog"];
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
function clean(value, max, min = 1) {
  if (typeof value !== "string") fail("invalid-argument", "Enter text.");
  const s = value.normalize("NFKC").trim();
  if (
    s.length < min ||
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)
  )
    fail("invalid-argument", `Use ${min}–${max} characters.`);
  return s;
}
function content(value, max) {
  const s = clean(value, max);
  if (/\b(fuck|shit|cunt|nigger|faggot)\w*\b/i.test(s))
    fail("invalid-argument", "Please reword that message.");
  if (/(.)\1{14,}/u.test(s) || (s.match(/https?:\/\//gi) || []).length > 3)
    fail("invalid-argument", "That looks like spam.");
  return s;
}
exports.chatAction = onCall(
  { region: "us-central1", maxInstances: 10 },
  async (request) => {
    if (!request.auth) fail("unauthenticated", "Sign in first.");
    const uid = request.auth.uid,
      d = request.data || {},
      now = Date.now();
    const state = (await db.ref(`access/${uid}`).get()).val() || {};
    if (state.banned || state.kickedUntil > now)
      fail(
        "permission-denied",
        state.banned
          ? "This account is banned."
          : "You have been kicked. Try again later.",
      );
    const role = (await db.ref(`roles/${uid}`).get()).val();
    const mod = role === "admin" || role === "moderator";
    // Atomic shared budget applies across every room, tab and callable action.
    const budget = await db.ref(`limits/${uid}`).transaction((v) => {
      v = v || {};
      if (now - (v.last || 0) < 700) return;
      if (now - (v.window || 0) >= 60000) v = { window: now, count: 0 };
      if ((v.count || 0) >= 30) return;
      return { ...v, last: now, count: (v.count || 0) + 1 };
    });
    if (!budget.committed)
      fail(
        "resource-exhausted",
        "Slow down. Wait a moment before trying again.",
      );
    if (d.action === "profile") {
      const name = content(d.name, 24);
      if (/[\r\n\u202a-\u202e\u2066-\u2069]/.test(name))
        fail("invalid-argument", "Use a single-line username.");
      if (!avatars.includes(d.avatar))
        fail("invalid-argument", "Choose an avatar.");
      await db.ref(`profiles/${uid}`).set({ name, avatar: d.avatar });
      return { uid };
    }
    if (d.action === "moderate") {
      if (!mod) fail("permission-denied", "Moderator access required.");
      const target = clean(d.uid, 128);
      if (!/^[a-zA-Z0-9_-]+$/.test(target) || target === uid)
        fail("invalid-argument", "Invalid account.");
      const targetRole = (await db.ref(`roles/${target}`).get()).val();
      if (
        targetRole === "admin" ||
        (targetRole === "moderator" && role !== "admin")
      )
        fail("permission-denied", "You cannot moderate that account.");
      if (!["kick", "ban", "unban"].includes(d.mode))
        fail("invalid-argument", "Invalid moderation action.");
      await db
        .ref(`access/${target}`)
        .set({
          banned: d.mode === "ban",
          kickedUntil: d.mode === "kick" ? now + 15 * 60000 : 0,
        });
      await db.ref("audit").push({ by: uid, target, action: d.mode, at: now });
      return { ok: true };
    }
    if (!rooms.includes(d.room)) fail("invalid-argument", "Unknown room.");
    const profile = (await db.ref(`profiles/${uid}`).get()).val();
    if (!profile) fail("failed-precondition", "Choose your username first.");
    const base = db.ref(`messages/${d.room}`);
    if (d.action === "send") {
      const text = content(d.text, 1000);
      const reply = d.reply ? clean(d.reply, 64) : null;
      if (reply && !/^[a-zA-Z0-9_-]+$/.test(reply))
        fail("invalid-argument", "Invalid reply.");
      if (reply && !(await base.child(reply).get()).exists())
        fail("not-found", "The reply target is no longer available.");
      const result = await db.ref(`posting/${uid}`).transaction((v) => {
        if (v && now - v.at < 2000) return;
        if (v && v.text === text && now - v.at < 60000) return;
        return { at: now, text };
      });
      if (!result.committed)
        fail(
          "resource-exhausted",
          "Wait 2 seconds between messages. Avoid repeated messages.",
        );
      const ref = base.push();
      await ref.set({
        uid,
        name: profile.name,
        avatar: profile.avatar,
        text,
        at: now,
        reply,
      });
      return { id: ref.key };
    }
    const id = clean(d.id, 64);
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
      fail("invalid-argument", "Invalid message.");
    const ref = base.child(id),
      message = (await ref.get()).val();
    if (!message) fail("not-found", "Message not found.");
    if (d.action === "edit" || d.action === "delete") {
      if (message.uid !== uid && !(mod && d.action === "delete"))
        fail("permission-denied", "You can only change your own messages.");
      if (message.deleted) fail("failed-precondition", "Message was deleted.");
      await ref.update(
        d.action === "delete"
          ? { text: "", deleted: true, editedAt: now }
          : { text: content(d.text, 1000), editedAt: now },
      );
      return { ok: true };
    }
    if (d.action === "react") {
      if (message.deleted) fail("failed-precondition", "Message was deleted.");
      if (!["like", "heart", "laugh"].includes(d.reaction))
        fail("invalid-argument", "Invalid reaction.");
      await ref
        .child(`reactions/${d.reaction}/${uid}`)
        .transaction((v) => (v ? null : true));
      return { ok: true };
    }
    if (d.action === "report") {
      const reason = clean(d.reason, 300);
      await db
        .ref(`reports/${d.room}/${id}/${uid}`)
        .set({ reason, at: now, uid, messageUid: message.uid });
      return { ok: true };
    }
    fail("invalid-argument", "Unknown action.");
  },
);
