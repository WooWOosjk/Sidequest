# Native Sidequest chat

The frontend is ordinary HTML/CSS/JavaScript. Firebase Authentication provides guest identities and optional email accounts. Realtime Database stores chat history and presence. The `chatAction` Cloud Function validates every message/profile/reaction/report/moderation write. There is no chat iframe and no frontend build step.

**The supplied frontend is deliberately unconfigured. It will show setup instructions until you connect your own Firebase project.** Old provider messages cannot be imported automatically. Games and Web keep working independently.

## 1. Firebase Console

1. Open https://console.firebase.google.com/ and click **Add project**. Choose a name, create the project, and record its **Project ID** in Project settings → General. Analytics is optional.
2. Upgrade the project to **Blaze** and link a billing account. Cloud Functions deployment requires Blaze. Add a billing budget/alert in Google Cloud Billing; alerts do not cap spending.
3. Under **Build → Authentication**, click **Get started**. In **Sign-in method**, enable **Anonymous**. Enable **Email/Password** if you want accounts; do not enable email-link sign-in for this implementation.
4. In Authentication → **Settings → Authorized domains**, add your static site's hostname (no scheme or path), for example `sidequest-browser-arcade.friedsocrates.chatgpt.site`. Add `localhost` and `127.0.0.1` only if testing your real project locally. New projects may not include localhost automatically.
5. Under **Build → Realtime Database**, click **Create database**, choose **United States (us-central1)**, and select **Start in locked mode**. Use the default database instance. Copy its exact database URL. This chat uses Realtime Database, not Firestore; no Storage bucket is needed for the built-in avatars.
6. In Realtime Database → **Rules**, replace all rules with the exact contents of `backend/database.rules.json` and click **Publish**. Never use test-mode/public write rules. The CLI deployment below publishes the same rules.
7. In Project settings → General → **Your apps**, add a **Web app** (`</>`). Hosting registration is optional. Copy the public `firebaseConfig` object from the SDK configuration. Include the exact `databaseURL` from step 5.
8. Edit `website/chat-config.js`, replacing `firebase: null` with that object. Leave `region: 'us-central1'` and `emulator: false`.

Example shape, with your real public values:

```js
window.CHAT_CONFIG = {
  firebase: {
    apiKey: 'YOUR_PUBLIC_WEB_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    databaseURL: 'COPY_THE_EXACT_DATABASE_URL',
    projectId: 'YOUR_PROJECT_ID',
    appId: 'YOUR_WEB_APP_ID',
    messagingSenderId: 'YOUR_SENDER_ID'
  },
  region: 'us-central1',
  emulator: false
};
```

This public configuration is intended for browsers. Do not put a service-account JSON, private key, CLI login token, or admin credential in any website file.

## 2. Deploy the backend once

On a developer computer, install Node.js 22 and the Firebase CLI. On a Chromebook this can be done in its Linux development environment, or use another computer. Visitors need only Chrome and internet access.

From the `Sidequest/backend` folder:

```sh
npm install -g firebase-tools
firebase login
cd functions
npm ci
cd ..
firebase deploy --project YOUR_PROJECT_ID --only database,functions
```

Approve Firebase's API enablement prompts if requested. If asked for an artifact cleanup policy, choose a retention period. The function deploys to `us-central1`. You do not need `firebase init`; the required project files are included. If you change the database instance or region, update both configuration and backend accordingly.

Upload the contents of `website/` to your usual **HTTPS static host**, including `chat-config.js`, `chat.css`, and `chat.js`. No frontend npm install or build command is required. Do not upload `backend/`, node_modules, emulator data, or private credentials to the public website.

Open `chat.html` in the hosted site. Choose a username/avatar and save. Test in a second browser profile or incognito window. The game library remains usable from local files, but use the hosted HTTPS address for supported chat/account use on ChromeOS. `file://` and about:blank framing can restrict browser storage/auth; they are not the supported chat deployment.

## 3. Create your first administrator

1. Open the hosted Chat page, choose a profile, then create an email/password account in **Your profile → Keep your identity with an account**. Account creation links the guest identity, preserving its UID and messages.
2. Copy your UID shown in **Your profile**, or find it in Firebase Console → Authentication → Users. Verify your email.
3. In Firebase Console → Realtime Database → **Data**, create a root `roles` object with a child whose key is that UID and whose string value is `admin`:

```json
{"roles":{"YOUR_UID":"admin"}}
```

Add this child using the Console editor; **do not import this snippet at the root**, which would replace existing data. Only the trusted Firebase Console/operator can assign roles. The browser cannot create or change them. For another moderator, set `roles/OTHER_UID` to `moderator`. Delete that role child to revoke access. Role changes take effect in the UI live and the function checks the current database role on every action.

Moderators can view reports, remove messages, kick accounts for 15 minutes, and ban/unban ordinary accounts. Administrators can also moderate moderators. No one can moderate an administrator through the chat function. Reports include the message ID, sender UID, reason, and time. There is no email alert service. Review reports with the **Reports** button. You can remove resolved report records in the Console.

## Files and data

- `website/chat.html`: accessible chat page using the existing navigation.
- `website/chat.css`: chat-specific styles; other sections use their existing styles.
- `website/chat.js`: UI, authentication, listeners, sound, reconnect/presence.
- `website/chat-config.js`: public client configuration only.
- `backend/functions/index.js`: all trusted chat mutations.
- `backend/functions/package.json` and lockfile: backend dependencies.
- `backend/database.rules.json`: exact deployable database rules.
- `backend/firebase.json`: deploy/emulator configuration.
- `backend/tests/`: reproducible browser integration tests and local static server.

Database paths: `messages/ROOM/MESSAGE_ID`, `profiles/UID`, `presence/UID/SESSION_ID`, `roles/UID`, `access/UID`, `limits/UID`, `posting/UID`, `reports/ROOM/MESSAGE_ID/REPORTER_UID`, and `audit`. Browser clients can read public profiles, room messages, and presence when authenticated and unrestricted. Only their own role/access record is readable. Reports are moderator-only. All browser writes are denied except validated presence for the caller's own UID. The function uses Firebase Admin credentials supplied by its runtime, never by the frontend.

Messages are plain text, created with `textContent`; HTML, scripts, markdown, and arbitrary image URLs are not rendered. Profile pictures are the six local emoji avatars, selectable by each user. Display names need not be unique and are not proof of identity. The name/avatar stored with an old message stays as it was when sent.

## Limits and moderation behavior

Backend limits: 1–24 characters for usernames, 1–1000 for messages, 1–300 for report reasons, at least 2 seconds between messages, duplicate text blocked for 60 seconds, at least 700 ms between actions, and no more than 30 actions per minute per UID. Atomic database transactions share limits across tabs and rooms. Malformed room IDs/reaction types/avatar types are rejected. A basic server profanity word filter, repeated-character filter, and limit of three links per message are included; customize the word list in the function. These basic controls cannot recognize all obfuscated profanity or unwanted content.

Deletion keeps a tombstone so replies still work; the original body is cleared. Moderators can delete anyone's message, while editing is sender-only. Messages remain in the database until deleted by an operator; no expiry is set. The UI initially loads the newest 60, with earlier-history paging up to 600 messages. Unread badges count up to the latest 100 messages per room, and local read positions/mute settings are device-specific. Notification tones are generated locally with Web Audio after user interaction; no remote sound file or push-notification service is used.

Presence uses server timestamps, per-tab sessions, heartbeat updates, and `onDisconnect` cleanup. Stale sessions disappear from the online list after 75 seconds; disconnect detection can take a little time. Typing expires quickly. Writes are disabled offline; reconnecting restores listeners/history. The chat does not queue offline messages silently.

Kick/ban enforcement is against Firebase **UIDs**, including read access, and applies server-side. A person can clear a guest identity or create another account; these are not IP/device bans. For a larger public community, consider verified-account-only posting and additional abuse detection. App Check is a separate optional hardening step: register your web app, integrate its SDK, then enforce it for Database and callable functions only after validating tokens. It is not enabled in this starter, so do not turn on enforcement without integration. Keep billing alerts and review reports. The included permission rules do not rely on hidden frontend controls or trusted usernames.

## Run the included local tests

Install Node.js 22 and Java 21+. From `backend/`:

```sh
cd functions
npm ci
cd ..
cd tests
npm ci
cd ..
npx firebase-tools emulators:start --project demo-sidequest --only auth,database,functions
```

Wait until the emulator terminal says **All emulators ready**. In another terminal in `backend/`:

```sh
node tests/server.cjs
```

In a third terminal:

```sh
node tests/integration.cjs
node tests/extra.cjs
```

The test server serves the sibling `website/` and replaces its config **in memory** with demo emulator values. It never writes those values into the production config. It runs only on loopback. Install a Chromium test browser with `npx playwright install chromium` in `backend/tests` if necessary. The suite clears the **demo emulator** database, creates two isolated browser identities, and tests delivery/history/reconnection, limits, forged writes, XSS, moderation, and responsive layouts. It does not connect to a real Firebase project. See CHAT-TEST-REPORT.md for actual results and remaining production checks.

## Official references

- [Firebase web setup](https://firebase.google.com/docs/web/alt-setup)
- [Anonymous authentication and account linking](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Callable functions](https://firebase.google.com/docs/functions/callable)
- [Functions setup and Blaze requirement](https://firebase.google.com/docs/functions/get-started)
- [Realtime Database rules](https://firebase.google.com/docs/database/security/rules-conditions)
- [Presence and disconnect handling](https://firebase.google.com/docs/database/web/offline-capabilities)
