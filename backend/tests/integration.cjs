const { chromium } = require("playwright");
const assert = require("assert/strict");
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function adminSet(path, value) {
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
  assert(r.ok, await r.text());
}
async function action(p, data) {
  return p.evaluate(async (data) => {
    try {
      return {
        ok: true,
        result: (
          await firebase
            .app()
            .functions("us-central1")
            .httpsCallable("chatAction")(data)
        ).data,
      };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message };
    }
  }, data);
}
async function waitBudget() {
  await sleep(800);
}
(async () => {
  await adminSet("", null);
  const b = await chromium.launch(),
    ca = await b.newContext({ ignoreHTTPSErrors: true }),
    cb = await b.newContext({ ignoreHTTPSErrors: true }),
    a = await ca.newPage(),
    p = await cb.newPage();
  const failures = [];
  for (const page of [a, p]) {
    page.on("pageerror", (e) => failures.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto("http://127.0.0.1:8099/chat.html");
    await page.locator("#profile-dialog").waitFor({ state: "visible" });
    await page.locator("#username").fill(page === a ? "Alice" : "Bob");
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page.locator("#profile-dialog").waitFor({ state: "hidden" });
  }
  const uidA = await a.evaluate(() => firebase.auth().currentUser.uid),
    uidB = await p.evaluate(() => firebase.auth().currentUser.uid);
  assert.notEqual(uidA, uidB);
  await a.waitForFunction(
    () => document.getElementById("online-count").textContent === "2",
  );
  await waitBudget();
  await a.locator("#message-input").fill("Hello from Alice");
  await a.locator("#send").click();
  await p
    .locator(".message-text")
    .filter({ hasText: "Hello from Alice" })
    .waitFor();
  assert(
    await a.locator("#toast").isHidden(),
    "Chat buttons must not trigger game actions",
  );
  const id = await p.locator(".message").first().getAttribute("data-id");
  console.log(
    "PASS two sessions: identities, online status, send/receive, timestamp",
  );
  await p.locator("#message-input").fill("typing test");
  await a.locator("#typing").filter({ hasText: "Bob is typing" }).waitFor();
  await p.locator("#message-input").fill("");
  await p
    .locator(".message")
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await p.locator("#message-input").fill("Reply from Bob");
  await p.locator("#send").click();
  await a.locator(".quoted").filter({ hasText: "Hello from Alice" }).waitFor();
  await waitBudget();
  assert(
    (
      await action(p, {
        action: "react",
        room: "general",
        id,
        reaction: "heart",
      })
    ).ok,
  );
  await a.waitForFunction(() =>
    document
      .querySelector('[aria-label="heart reaction"]')
      .textContent.includes("1"),
  );
  console.log("PASS replies, reactions, typing");
  await waitBudget();
  const forbidden = await action(p, {
    action: "edit",
    room: "general",
    id,
    text: "stolen",
  });
  assert.equal(forbidden.code, "functions/permission-denied");
  await waitBudget();
  const xss =
    '<img src=x onerror="window.chatXSS=1"><script>window.chatXSS=2</script>';
  assert(
    (await action(a, { action: "edit", room: "general", id, text: xss })).ok,
  );
  await p.locator(".message-text").filter({ hasText: xss }).waitFor();
  assert.equal(await p.locator("#messages img, #messages script").count(), 0);
  assert.equal(await p.evaluate(() => window.chatXSS), undefined);
  console.log("PASS sender permissions, editing, XSS rendered as text");
  await waitBudget();
  assert(
    (
      await action(a, {
        action: "send",
        room: "games",
        text: "Game room message",
      })
    ).ok,
  );
  await p.locator("#room-games .unread").filter({ hasText: "1" }).waitFor();
  await p.locator("#room-games").click();
  await p
    .locator(".message-text")
    .filter({ hasText: "Game room message" })
    .waitFor();
  await p.locator("#room-general").click();
  await p.reload();
  await p.locator(".message-text").filter({ hasText: xss }).waitFor();
  assert.equal(await p.evaluate(() => firebase.auth().currentUser.uid), uidB);
  console.log(
    "PASS multiple rooms, unread, identity and message persistence after reload",
  );
  await p.evaluate(() => firebase.database().goOffline());
  await p.waitForFunction(() =>
    document.getElementById("connection").textContent.includes("Offline"),
  );
  assert(await p.locator("#send").isDisabled());
  await p.evaluate(() => firebase.database().goOnline());
  await p.waitForFunction(
    () => document.getElementById("connection").textContent === "Online",
  );
  await p.locator(".message-text").filter({ hasText: xss }).waitFor();
  console.log("PASS disconnect/reconnect");
  await sleep(2100);
  const rateStart = await action(a, {
    action: "send",
    room: "general",
    text: "rate test",
  });
  assert(rateStart.ok, JSON.stringify(rateStart));
  const rate = await action(a, {
    action: "send",
    room: "general",
    text: "too soon",
  });
  assert.equal(rate.code, "functions/resource-exhausted");
  await waitBudget();
  assert.equal(
    (
      await action(a, {
        action: "send",
        room: "general",
        text: "x".repeat(1001),
      })
    ).code,
    "functions/invalid-argument",
  );
  await waitBudget();
  assert.equal(
    (await action(a, { action: "send", room: "general", text: "shit" })).code,
    "functions/invalid-argument",
  );
  await waitBudget();
  assert.equal(
    (await action(a, { action: "send", room: "general", text: "x".repeat(20) }))
      .code,
    "functions/invalid-argument",
  );
  console.log("PASS rate, length, profanity, repeated-character spam");
  const denied = await p.evaluate(async (uid) => {
    const paths = [
      "messages/general/forged",
      "roles/" + uid,
      "access/" + uid,
      "profiles/" + uid,
      "reports/forged",
      "presence/" + uid + "/forged",
    ];
    const results = [];
    for (const path of paths) {
      try {
        await firebase
          .database()
          .ref(path)
          .set({
            uid: "other",
            text: "forged",
            typing: true,
            at: 0,
            room: "bad",
          });
        results.push(false);
      } catch (e) {
        results.push(
          String(e.code).toUpperCase().replaceAll("-", "_") ===
            "PERMISSION_DENIED",
        );
      }
    }
    return results;
  }, uidA);
  assert(denied.every(Boolean), JSON.stringify(denied));
  console.log(
    "PASS database denies forged messages/roles/access/profiles/reports/presence",
  );
  await waitBudget();
  assert.equal(
    (await action(p, { action: "moderate", uid: uidA, mode: "ban" })).code,
    "functions/permission-denied",
  );
  await waitBudget();
  assert(
    (
      await action(p, {
        action: "report",
        room: "general",
        id,
        reason: "Test report",
      })
    ).ok,
  );
  assert.equal(
    await p.evaluate(async () => {
      try {
        await firebase.database().ref("reports").get();
        return "allowed";
      } catch (e) {
        return /permission[ _-]denied/i.test(e.message)
          ? "PERMISSION_DENIED"
          : String(e.code);
      }
    }),
    "PERMISSION_DENIED",
  );
  await adminSet("roles/" + uidA, "admin");
  await a.locator("#moderation-button").waitFor({ state: "visible" });
  await a.locator("#moderation-button").click();
  await a.locator("#reports").filter({ hasText: "Test report" }).waitFor();
  await a.locator("#close-reports").click();
  await waitBudget();
  assert((await action(a, { action: "moderate", uid: uidB, mode: "kick" })).ok);
  await p.locator("#chat-error").filter({ hasText: "kicked" }).waitFor();
  await waitBudget();
  assert.equal(
    (await action(p, { action: "send", room: "general", text: "kick bypass" }))
      .code,
    "functions/permission-denied",
  );
  await waitBudget();
  assert((await action(a, { action: "moderate", uid: uidB, mode: "ban" })).ok);
  await waitBudget();
  assert.equal(
    (await action(p, { action: "send", room: "general", text: "ban bypass" }))
      .code,
    "functions/permission-denied",
  );
  assert.equal(
    await p.evaluate(async () => {
      try {
        await firebase.database().ref("messages/general").get();
        return "allowed";
      } catch (e) {
        return /permission[ _-]denied/i.test(e.message)
          ? "PERMISSION_DENIED"
          : String(e.code);
      }
    }),
    "PERMISSION_DENIED",
  );
  await waitBudget();
  assert(
    (await action(a, { action: "moderate", uid: uidB, mode: "unban" })).ok,
  );
  await p.reload();
  await p.locator(".message-text").filter({ hasText: xss }).waitFor();
  console.log("PASS reports privacy, moderator UI, kick/ban enforced, unban");
  await waitBudget();
  assert((await action(a, { action: "delete", room: "general", id })).ok);
  await p
    .locator(".message-text")
    .filter({ hasText: "Message deleted" })
    .waitFor();
  console.log("PASS deletion");
  await a.locator("#mute").click();
  await a.reload();
  await a.waitForFunction(
    () =>
      document.getElementById("mute").getAttribute("aria-pressed") === "true",
  );
  console.log("PASS mute persists");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await a.setViewportSize({ width, height: 900 });
    await a.locator("#chat-layout").waitFor({ state: "visible" });
    assert(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
    await a.screenshot({
      path: require("path").join(__dirname, `native-chat-${width}.png`),
    });
  }
  console.log("PASS responsive 1440/1024/768/390/320");
  await cb.close();
  await a.waitForFunction(
    () => document.getElementById("online-count").textContent === "1",
    {},
    { timeout: 15000 },
  );
  console.log("PASS presence disconnect cleanup");
  assert.deepEqual(failures, []);
  await b.close();
  fs.writeFileSync(
    require("path").join(__dirname, "chat-tests-passed.txt"),
    "Two-session emulator integration suite passed " + new Date().toISOString(),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
