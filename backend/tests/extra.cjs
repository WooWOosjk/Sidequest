const { chromium } = require("playwright");
const assert = require("assert/strict");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adminSet = async (path, value) => {
  const r = await fetch(
    "http://127.0.0.1:9000/" + path + ".json?ns=demo-sidequest-default-rtdb",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    },
  );
  assert(r.ok);
};
const call = (p, d) =>
  p.evaluate(async (data) => {
    try {
      await firebase.app().functions("us-central1").httpsCallable("chatAction")(
        data,
      );
      return "ok";
    } catch (e) {
      return e.code;
    }
  }, d);
(async () => {
  const b = await chromium.launch(),
    c = await b.newContext({ ignoreHTTPSErrors: true });
  await c.addInitScript(() => {
    const Audio = window.AudioContext;
    window.AudioContext = class extends Audio {
      createOscillator() {
        window.testTones = (window.testTones || 0) + 1;
        return super.createOscillator();
      }
    };
  });
  const p = await c.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto("http://127.0.0.1:8099/chat.html");
  await p.locator("#profile-dialog").waitFor({ state: "visible" });
  await p.locator("#username").fill("Account tester");
  await p.locator("#avatar").selectOption("frog");
  await p.getByRole("button", { name: "Save profile", exact: true }).click();
  await p.locator("#profile-dialog").waitFor({ state: "hidden" });
  const uid = await p.evaluate(() => firebase.auth().currentUser.uid);
  await p.locator("#profile-button").click();
  await p.locator("summary").click();
  const email = "tester-" + Date.now() + "@example.test";
  await p.locator("#email").fill(email);
  await p.locator("#password").fill("testing-password-42");
  await p.getByRole("button", { name: "Create account", exact: true }).click();
  await p
    .locator("#profile-status")
    .filter({ hasText: "Account created" })
    .waitFor();
  assert.equal(await p.evaluate(() => firebase.auth().currentUser.uid), uid);
  assert.equal(
    await p.evaluate(() => firebase.auth().currentUser.isAnonymous),
    false,
  );
  await p.locator("#close-profile").click();
  console.log("PASS guest account linking preserves UID and avatar");
  const c2 = await b.newContext({ ignoreHTTPSErrors: true }),
    q = await c2.newPage();
  q.on("dialog", (d) => d.accept());
  await q.goto("http://127.0.0.1:8099/chat.html");
  await q.locator("#profile-dialog").waitFor({ state: "visible" });
  await q.locator("summary").click();
  await q.locator("#email").fill(email);
  await q.locator("#password").fill("testing-password-42");
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await q
    .locator("#profile-status")
    .filter({ hasText: "Signed in." })
    .waitFor();
  assert.equal(await q.evaluate(() => firebase.auth().currentUser.uid), uid);
  await q.locator("#close-profile").click();
  console.log("PASS account login from a second browser");
  await sleep(850);
  await adminSet("limits/" + uid, { window: Date.now(), last: 0, count: 30 });
  assert.equal(
    await call(p, {
      action: "profile",
      name: "Too many actions",
      avatar: "frog",
    }),
    "functions/resource-exhausted",
  );
  await adminSet("limits/" + uid, null);
  const concurrent = await Promise.all([
    call(p, {
      action: "send",
      room: "off-topic",
      text: "Shared duplicate race",
    }),
    call(q, {
      action: "send",
      room: "off-topic",
      text: "Shared duplicate race",
    }),
  ]);
  assert.equal(concurrent.filter((x) => x === "ok").length, 1);
  assert.equal(
    concurrent.filter((x) => x === "functions/resource-exhausted").length,
    1,
  );
  console.log("PASS minute budget and cross-session atomic limits");
  const ownPresence = await p.evaluate(async (uid) => {
    for (const value of [
      { room: "general", at: 0, typing: true },
      {
        room: "unknown",
        at: firebase.database.ServerValue.TIMESTAMP,
        typing: true,
      },
      {
        room: "general",
        at: firebase.database.ServerValue.TIMESTAMP,
        typing: "yes",
      },
      {
        room: "general",
        at: firebase.database.ServerValue.TIMESTAMP,
        typing: true,
        extra: "bad",
      },
    ]) {
      try {
        await firebase
          .database()
          .ref("presence/" + uid + "/invalid")
          .set(value);
        return false;
      } catch (e) {
        if (!/permission[ _-]denied/i.test(e.message)) throw e;
      }
    }
    return true;
  }, uid);
  assert(ownPresence);
  const noAuth = await fetch(
    "http://127.0.0.1:9000/messages/general.json?ns=demo-sidequest-default-rtdb",
  );
  assert.equal(noAuth.status, 401);
  console.log("PASS presence schema and unauthenticated read denial");
  const at = Date.now();
  await adminSet("messages/movies/sound-test", {
    uid: "someone-else",
    name: "Sound tester",
    avatar: "cat",
    text: "Notification test",
    at,
  });
  await p.waitForFunction(() => window.testTones > 0);
  await p.locator("#mute").click();
  const tones = await p.evaluate(() => window.testTones);
  await adminSet("messages/movies/sound-test-2", {
    uid: "someone-else",
    name: "Sound tester",
    avatar: "cat",
    text: "Muted notification",
    at: at + 1,
  });
  await sleep(700);
  assert.equal(await p.evaluate(() => window.testTones), tones);
  console.log("PASS local notification tone and mute suppresses tone");
  const history = {};
  for (let i = 0; i < 65; i++)
    history["history-" + i] = {
      uid: "history-test",
      name: "History",
      avatar: "ghost",
      text: "History line " + i,
      at: at + i,
    };
  await adminSet("messages/books", history);
  await p.locator("#room-books").click();
  await p.locator(".message").first().waitFor();
  assert.equal(await p.locator(".message").count(), 60);
  await p.locator("#older").click();
  await p.waitForFunction(
    () => document.querySelectorAll(".message").length === 65,
  );
  console.log("PASS earlier-history loading");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
