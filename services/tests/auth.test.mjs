import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

test('anonymous Movies/TV, exact origins, rate limits, protected APIs and Wisp', {timeout: 30000}, async () => {
  const port = 18100 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const portal = 'https://sidequest-browser-arcade.friedsocrates.chatgpt.site';
  const auth = 'Basic ' + Buffer.from('fixture-user:fixture-password').toString('base64');
  const child = spawn(process.execPath, ['--import', new URL('./providers.mjs', import.meta.url).href, 'server.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {...process.env, HOST: '0.0.0.0', PORT: String(port), SERVICE_USER: 'fixture-user', SERVICE_PASSWORD: 'fixture-password', TMDB_TOKEN: 'fixture-tmdb', GROQ_API_KEY: 'fixture-groq', GROQ_MODEL: '', MOVIE_PLAYER_TEMPLATE: '', TV_PLAYER_TEMPLATE: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
      child.once('exit', code => {clearTimeout(timer); reject(Error('Server exited ' + code));});
      child.stdout.on('data', data => {if (String(data).includes('listening')) {clearTimeout(timer); resolve();}});
      child.stderr.on('data', data => process.stderr.write(data));
    });
    const request = (path, options) => fetch(base + path, options);
    for (const path of ['/media.html', '/styles.css', '/gamer.css', '/services.css', '/common.js', '/blank.js', '/services-config.js', '/services.js', '/media.html?from=portal']) {
      const r = await request(path);
      assert.equal(r.status, 200, path);
      assert.equal(r.headers.get('www-authenticate'), null, path);
      const text = await r.text();
      for (const secret of ['fixture-user', 'fixture-password', 'fixture-tmdb', 'fixture-groq']) assert.ok(!text.includes(secret), path);
    }
    assert.equal((await request('/media.html', {method:'HEAD'})).status, 200);
    for (const path of ['/api/status', '/ai.html', '/proxy.html', '/sw.js', '/scram/scramjet.all.js', '/baremux/index.js', '/epoxy/index.mjs', '/source/server.mjs', '/api/media/extra', '/%61pi/media', '/api//media', '/media.html/extra']) assert.equal((await request(path)).status, 401, path);
    assert.equal((await request('/api/ai', {method:'POST'})).status, 401);
    assert.equal((await request('/api/media', {method:'POST'})).status, 401);
    assert.equal((await request('/api/status', {headers:{Authorization: 'Basic invalid'}})).status, 401);
    assert.equal((await request('/api/status', {headers:{Authorization:auth}})).status, 200);
    assert.equal((await request('/api/status', {headers:{Authorization:auth, Origin:portal}})).status, 403);
    const r = await request('/api/media?kind=tv&search=test', {headers:{Origin:portal}});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('www-authenticate'), null);
    assert.equal(r.headers.get('access-control-allow-origin'), portal);
    assert.equal(r.headers.get('access-control-allow-credentials'), null);
    assert.equal(r.headers.get('vary'), 'Origin');
    assert.equal((await r.json()).results[0].title, 'Fixture movie');
    assert.equal((await request('/api/media', {headers:{Origin:base}})).status, 200);
    for (const origin of ['https://evil.example', portal+'.evil.example', 'null', 'http://sidequest-browser-arcade.friedsocrates.chatgpt.site']) {
      const denied = await request('/api/media', {headers:{Origin:origin}});
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    }
    const preflight = await request('/api/media', {method:'OPTIONS', headers:{Origin:portal,'Access-Control-Request-Method':'GET'}});
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), portal);
    assert.equal((await request('/api/player?id=11')).status, 200);
    assert.equal((await request('/api/player?id=bad')).status, 400);
    for (let i=0;i<28;i++) assert.equal((await request('/api/media')).status, 200);
    assert.equal((await request('/api/media')).status, 429);
    for (let i=0;i<58;i++) assert.equal((await request('/api/player?id=11')).status, 200);
    assert.equal((await request('/api/player?id=11')).status, 429);
    const ai = () => request('/api/ai', {method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'}, body:JSON.stringify({message:'test'})});
    for(let i=0;i<8;i++) assert.equal((await ai()).status, 200);
    assert.equal((await ai()).status, 429);
    const upgrade = headers => new Promise((resolve, reject) => {
      const req = http.request(base+'/wisp/', {headers:{Connection:'Upgrade', Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==', Origin:base, ...headers}});
      req.on('upgrade', (res,socket)=>{socket.destroy(); resolve(res.statusCode);});
      req.on('response',res=>{res.resume(); resolve(res.statusCode);});
      req.on('error',reject); req.end();
    });
    assert.equal(await upgrade({}), 403);
    assert.equal(await upgrade({Authorization:auth, Origin:'https://evil.example'}), 403);
    assert.equal(await upgrade({Authorization:auth}), 101);
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit',resolve));
  }
});

test('Groq request/response contract, model config, missing key and safe errors', {timeout: 30000}, async (t) => {
  async function withServer(overrides, run) {
    const port = 19100 + Math.floor(Math.random() * 1000);
    let logs = '';
    const child = spawn(process.execPath, ['--import', new URL('./providers.mjs', import.meta.url).href, 'server.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: {...process.env, HOST: '0.0.0.0', PORT: String(port), SERVICE_USER: 'fixture-user', SERVICE_PASSWORD: 'fixture-password', GROQ_API_KEY: 'fixture-groq', GROQ_MODEL: '', ...overrides},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => {logs += String(data);});
    child.stderr.on('data', data => {logs += String(data);});
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
        child.once('exit', code => {clearTimeout(timer); reject(Error('Server exited ' + code));});
        child.stdout.on('data', data => {if (String(data).includes('listening')) {clearTimeout(timer); resolve();}});
      });
      const authorization = 'Basic ' + Buffer.from('fixture-user:fixture-password').toString('base64');
      const request = (route, options = {}) => fetch(`http://127.0.0.1:${port}${route}`, {...options, headers: {Authorization: authorization, ...options.headers}});
      const ai = message => request('/api/ai', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message})});
      await run(ai, request);
    } finally {
      child.kill();
      if (child.exitCode === null) await new Promise(resolve => child.once('exit',resolve));
      assert.ok(!logs.includes('fixture-groq'), 'Key must not be logged');
    }
  }
  await t.test('default model, single-prompt replies and validation', () => withServer({}, async (ai, request) => {
    assert.equal((await (await request('/api/status')).json()).ai, true);
    for (const message of [' first prompt ', 'second independent prompt']) {
      const r = await ai(message);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), {text:'Fixture reply <script>window.injected=1</script>'});
    }
    assert.equal((await ai('')).status, 400);
    assert.equal((await ai('x'.repeat(8001))).status, 400);
    const empty = await ai('empty-reply');
    assert.deepEqual(await empty.json(), {text:'No response was returned.'});
    const redacted = await ai('echo-key');
    assert.deepEqual(await redacted.json(), {text:'[redacted]'});
  }));
  await t.test('configurable namespaced model', () => withServer({GROQ_MODEL:'openai/gpt-oss-120b'}, async ai => {
    assert.equal((await ai('custom model')).status, 200);
  }));
  await t.test('legacy Gemini variables do not enable AI without Groq key', () => withServer({GROQ_API_KEY:'', GEMINI_API_KEY:'legacy-fixture', GEMINI_MODEL:'legacy-fixture'}, async (ai, request) => {
    assert.equal((await (await request('/api/status')).json()).ai, false);
    const r = await ai('missing key');
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), {error:'AI needs GROQ_API_KEY on the service server.'});
  }));
  await t.test('invalid model is handled safely', () => withServer({GROQ_MODEL:'invalid model'}, async ai => {
    assert.equal((await ai('test')).status, 502);
  }));
  await t.test('upstream failures do not leak details or keys', () => withServer({}, async ai => {
    for (const message of ['provider-error', 'provider-throws', 'provider-invalid-json']) {
      const r = await ai(message);
      assert.equal(r.status, 502);
      const data = await r.json();
      assert.equal(typeof data.error, 'string');
      assert.ok(!JSON.stringify(data).includes('fixture-groq'));
      assert.ok(!JSON.stringify(data).includes('Sensitive'));
    }
  }));
});
