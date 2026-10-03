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
    env: {...process.env, HOST: '0.0.0.0', PORT: String(port), SERVICE_USER: 'fixture-user', SERVICE_PASSWORD: 'fixture-password', TMDB_TOKEN: 'fixture-tmdb', GEMINI_API_KEY: 'fixture-gemini', MOVIE_PLAYER_TEMPLATE: '', TV_PLAYER_TEMPLATE: ''},
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
      for (const secret of ['fixture-user', 'fixture-password', 'fixture-tmdb', 'fixture-gemini']) assert.ok(!text.includes(secret), path);
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
