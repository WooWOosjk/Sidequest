# Native chat validation

Tested October 2, 2026 with Chromium/Playwright, real Firebase Authentication, Realtime Database, and callable Functions emulators (`demo-sidequest`). Two separate browser contexts used separate guest identities. No production chat service or third-party chatroom was contacted to send messages.

Passed:

- Guest sign-in, custom usernames, selectable avatars, and live online counts.
- Sending and receiving between two browser sessions, server timestamps, room isolation.
- Replies, reaction toggle/update, sender editing, sender/moderator deletion.
- History and guest identity after page reload; earlier-history loading.
- Database disconnect/reconnect, disabled offline sending, presence cleanup when a browser session closes.
- Unread badge in an inactive room and clearing it on room selection.
- Local oscillator notification tone after interaction; mute suppression and persistence.
- Linking a guest to email/password without changing its UID; login from a second browser context.
- Per-action/posting limits, minute action budget, duplicate-message rejection across sessions, length limit, basic profanity/repeated-character spam rejection.
- Forged direct writes to messages, profiles, roles, bans/access, reports, and other users' presence were denied by database rules.
- Invalid own-presence schemas/timestamps/rooms and unauthenticated message reads were denied.
- Editing another sender's message and ordinary-user moderation were rejected by the callable backend.
- Reports were invisible to ordinary users and visible in the moderator UI.
- Kick/ban rejected subsequent backend posting and database reads; unban restored access.
- An `<img onerror>` and `<script>` payload was displayed as literal message text, with no injected element and no script execution.
- Layout widths 1440, 1024, 768, 390, and 320px had no document overflow. Desktop/mobile screenshots inspected.
- Unconfigured local-file setup screen, no chat iframe, Chat navigation back to the unchanged 424-game library, and no accidental Random Game handler on chat buttons.

Test tooling used Node 24 locally for the emulator; the deployed function is configured for the supported Node 22 runtime. Firebase CLI 14.27.0 was used with the machine's Java 19; new installations should use Java 21+ and the current CLI. The function's demo database URL is explicitly aligned with the default instance where the CLI loads the supplied rules. Permission tests ran against those locked rules, not an automatically open secondary emulator namespace.

The delivered `chat-config.js` has no Firebase project configured. Production deployment, real email delivery/reset links, billing, production App Check, and physical Chromebook/mobile keyboard behavior still require the owner's Firebase setup and live smoke test. Emulator tests do not certify production configuration. No old third-party messages were migrated. No remote Firebase project was created or charged.

Reproduce with the commands in CHAT-SETUP.md. The integration tests intentionally clear only the loopback demo emulator database. The separate extra test checks account linking/login, action budgets, presence validation, sound/mute, and earlier-history loading.
