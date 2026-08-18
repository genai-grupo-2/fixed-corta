if (process.env.CORTA_PATCH_RANDOM_ONLY === '1') {
  const values = (process.env.CORTA_RANDOM_VALUES || '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  let index = 0;

  Math.random = function () {
    if (index < values.length) {
      return values[index++];
    }
    return values.length > 0 ? values[values.length - 1] : 0;
  };
} else {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const fs = require('node:fs/promises');
  const net = require('node:net');
  const path = require('node:path');
  const { spawn } = require('node:child_process');

  const ROOT = __dirname;
  const SERVER_FILE = path.join(ROOT, 'server.js');
  const DB_FILE = path.join(ROOT, 'links.json');

  function charRandomValue(char) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const index = alphabet.indexOf(char);
    assert.notEqual(index, -1, 'test helper received an invalid short-code character');
    return index / alphabet.length;
  }

  function randomValuesForCodes(codes) {
    return codes
      .join('')
      .split('')
      .map(charRandomValue)
      .join(',');
  }

  async function getAvailablePort() {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
    });
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 1000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function waitForServer(baseUrl, child, timeoutMs = 2500) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (child.exitCode !== null) {
        throw new Error(`server exited before accepting requests with code ${child.exitCode}`);
      }

      try {
        await fetchWithTimeout(`${baseUrl}/`, {}, 250);
        return;
      } catch (_error) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    throw new Error(`server did not accept requests at ${baseUrl}`);
  }

  async function stopServer(child) {
    if (child.exitCode !== null) {
      return;
    }

    child.kill();
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async function withServer(options, run) {
    const {
      fixture = [],
      port = await getAvailablePort(),
      randomCodes = []
    } = options;
    const originalDb = await fs.readFile(DB_FILE, 'utf8');
    await fs.writeFile(DB_FILE, JSON.stringify(fixture, null, 2));

    const env = { ...process.env, PORT: String(port) };
    const args = [];

    if (randomCodes.length > 0) {
      env.CORTA_PATCH_RANDOM_ONLY = '1';
      env.CORTA_RANDOM_VALUES = randomValuesForCodes(randomCodes);
      args.push('-r', __filename);
    }

    args.push(SERVER_FILE);

    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      await waitForServer(baseUrl, child);
      return await run({ baseUrl, child });
    } catch (error) {
      error.message = `${error.message}${stderr ? `\nserver stderr:\n${stderr}` : ''}`;
      throw error;
    } finally {
      await stopServer(child);
      await fs.writeFile(DB_FILE, originalDb);
    }
  }

  async function postJson(baseUrl, pathName, body) {
    return fetchWithTimeout(`${baseUrl}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async function readJson(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      error.message = `response was not JSON: ${text}`;
      throw error;
    }
  }

  function assertJsonResponse(response) {
    assert.match(response.headers.get('content-type') || '', /application\/json/);
  }

  function assertIsoUtc(value) {
    assert.equal(typeof value, 'string');
    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(new Date(value).toISOString(), value);
  }

  test('POST /api/links creates HTTP and HTTPS links with the specified response shape', async () => {
    await withServer({ randomCodes: ['abc', 'h7s'] }, async ({ baseUrl }) => {
      for (const url of ['http://example.com/a', 'https://example.com/b']) {
        const response = await postJson(baseUrl, '/api/links', { url });
        const body = await readJson(response);

        assert.equal(response.status, 201);
        assertJsonResponse(response);
        assert.match(body.codigo, /^[a-z0-9]{3}$/);
        assert.equal(body.corta, `/${body.codigo}`);
      }
    });
  });

  test('POST /api/links stores trimmed URLs with clicks at zero and an ISO UTC creation date', async () => {
    await withServer({ randomCodes: ['c0d'] }, async ({ baseUrl }) => {
      const created = await postJson(baseUrl, '/api/links', {
        url: '  https://example.com/resource?x=1  '
      });
      const createdBody = await readJson(created);
      const stats = await fetchWithTimeout(`${baseUrl}/api/links/${createdBody.codigo}/stats`);
      const statsBody = await readJson(stats);

      assert.equal(created.status, 201);
      assert.equal(stats.status, 200);
      assertJsonResponse(stats);
      assert.equal(statsBody.codigo, createdBody.codigo);
      assert.equal(statsBody.url, 'https://example.com/resource?x=1');
      assert.equal(statsBody.clicks, 0);
      assertIsoUtc(statsBody.creado);
    });
  });

  test('POST /api/links rejects missing, blank, non-text, relative and forbidden-protocol URLs', async () => {
    const invalidBodies = [
      {},
      { url: '' },
      { url: '   ' },
      { url: 42 },
      { url: '/relative/path' },
      { url: 'javascript:alert(1)' },
      { url: 'data:text/plain,hello' },
      { url: 'file:///etc/passwd' },
      { url: 'ftp://example.com/file' }
    ];

    await withServer({ randomCodes: ['val'] }, async ({ baseUrl }) => {
      for (const body of invalidBodies) {
        const response = await postJson(baseUrl, '/api/links', body);
        const responseBody = await readJson(response);

        assert.equal(response.status, 400, `expected ${JSON.stringify(body)} to be rejected`);
        assertJsonResponse(response);
        assert.equal(typeof responseBody.error, 'string');
        assert.notEqual(responseBody.error.trim(), '');
      }

      const valid = await postJson(baseUrl, '/api/links', { url: 'https://example.com/ok' });
      const validBody = await readJson(valid);
      assert.equal(valid.status, 201);
      assert.equal(validBody.codigo, 'val');
    });
  });

  test('POST /api/links retries when a generated code already exists', async () => {
    const existing = [{
      codigo: 'aaa',
      url: 'https://existing.example',
      clicks: 7,
      creado: '2026-03-02T14:11:09.000Z'
    }];

    await withServer({ fixture: existing, randomCodes: ['aaa', 'aab'] }, async ({ baseUrl }) => {
      const response = await postJson(baseUrl, '/api/links', { url: 'https://new.example' });
      const body = await readJson(response);

      assert.equal(response.status, 201);
      assert.equal(body.codigo, 'aab');

      const existingStats = await fetchWithTimeout(`${baseUrl}/api/links/aaa/stats`);
      const existingBody = await readJson(existingStats);
      assert.equal(existingStats.status, 200);
      assert.equal(existingBody.url, 'https://existing.example');
      assert.equal(existingBody.clicks, 7);
    });
  });

  test('POST /api/links never reports duplicate successful codes for concurrent creations', async () => {
    await withServer({ randomCodes: Array(18).fill('aaa') }, async ({ baseUrl }) => {
      const responses = await Promise.all([
        postJson(baseUrl, '/api/links', { url: 'https://one.example' }),
        postJson(baseUrl, '/api/links', { url: 'https://two.example' })
      ]);
      const bodies = await Promise.all(responses.map(readJson));
      const successfulCodes = responses
        .map((response, index) => ({ status: response.status, codigo: bodies[index].codigo }))
        .filter((result) => result.status === 201)
        .map((result) => result.codigo);

      assert.ok(
        responses.every((response) => response.status === 201 || response.status === 503),
        `unexpected statuses: ${responses.map((response) => response.status).join(', ')}`
      );
      assert.equal(new Set(successfulCodes).size, successfulCodes.length);
    });
  });

  test('GET /:codigo redirects with Location and persists exactly one click', async () => {
    const fixture = [{
      codigo: 'r3d',
      url: 'https://destination.example/path?q=1',
      clicks: 0,
      creado: '2026-03-02T14:11:09.000Z'
    }];

    await withServer({ fixture }, async ({ baseUrl }) => {
      const response = await fetchWithTimeout(`${baseUrl}/r3d`, { redirect: 'manual' });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://destination.example/path?q=1');

      const stats = await fetchWithTimeout(`${baseUrl}/api/links/r3d/stats`);
      const body = await readJson(stats);
      assert.equal(body.clicks, 1);
    });
  });

  test('GET /:codigo persists every concurrent redirect without losing increments', async () => {
    const fixture = [{
      codigo: 'hot',
      url: 'https://destination.example/hot',
      clicks: 0,
      creado: '2026-03-02T14:11:09.000Z'
    }];

    await withServer({ fixture }, async ({ baseUrl }) => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => fetchWithTimeout(`${baseUrl}/hot`, { redirect: 'manual' }))
      );

      assert.deepEqual(responses.map((response) => response.status), Array(10).fill(302));

      const stats = await fetchWithTimeout(`${baseUrl}/api/links/hot/stats`);
      const body = await readJson(stats);
      assert.equal(body.clicks, 10);
    });
  });

  test('GET /:codigo returns 404 for unknown short codes without redirecting or changing data', async () => {
    const fixture = [{
      codigo: 'abc',
      url: 'https://destination.example',
      clicks: 4,
      creado: '2026-03-02T14:11:09.000Z'
    }];

    await withServer({ fixture }, async ({ baseUrl }) => {
      const missing = await fetchWithTimeout(`${baseUrl}/zzz`, { redirect: 'manual' });

      assert.equal(missing.status, 404);
      assert.equal(missing.headers.get('location'), null);

      const stats = await fetchWithTimeout(`${baseUrl}/api/links/abc/stats`);
      const body = await readJson(stats);
      assert.equal(body.clicks, 4);
    });
  });

  test('GET /api/links/:codigo/stats returns current link statistics without incrementing clicks', async () => {
    const fixture = [{
      codigo: 's7a',
      url: 'https://stats.example/resource',
      clicks: 42,
      creado: '2026-03-02T14:11:09.000Z'
    }];

    await withServer({ fixture }, async ({ baseUrl }) => {
      const first = await fetchWithTimeout(`${baseUrl}/api/links/s7a/stats`);
      const firstBody = await readJson(first);
      const second = await fetchWithTimeout(`${baseUrl}/api/links/s7a/stats`);
      const secondBody = await readJson(second);

      assert.equal(first.status, 200);
      assertJsonResponse(first);
      assert.deepEqual(firstBody, {
        codigo: 's7a',
        url: 'https://stats.example/resource',
        clicks: 42,
        creado: '2026-03-02T14:11:09.000Z'
      });
      assert.equal(second.status, 200);
      assert.equal(secondBody.clicks, 42);
    });
  });

  test('GET /api/links/:codigo/stats returns a JSON 404 for unknown codes', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const response = await fetchWithTimeout(`${baseUrl}/api/links/nope/stats`);
      const body = await readJson(response);

      assert.equal(response.status, 404);
      assertJsonResponse(response);
      assert.equal(typeof body.error, 'string');
      assert.notEqual(body.error.trim(), '');
    });
  });

  test('links and click counts survive a server restart', async () => {
    const originalDb = await fs.readFile(DB_FILE, 'utf8');
    const port = await getAvailablePort();
    let codigo;
    let child;

    try {
      await fs.writeFile(DB_FILE, JSON.stringify([], null, 2));

      const firstEnv = {
        ...process.env,
        CORTA_PATCH_RANDOM_ONLY: '1',
        CORTA_RANDOM_VALUES: randomValuesForCodes(['rst'])
      };
      child = spawn(process.execPath, ['-r', __filename, SERVER_FILE], {
        cwd: ROOT,
        env: { ...firstEnv, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(baseUrl, child);

      const created = await postJson(baseUrl, '/api/links', { url: 'https://restart.example' });
      const createdBody = await readJson(created);
      codigo = createdBody.codigo;

      await fetchWithTimeout(`${baseUrl}/${codigo}`, { redirect: 'manual' });
      await fetchWithTimeout(`${baseUrl}/${codigo}`, { redirect: 'manual' });
      await stopServer(child);
      child = undefined;

      child = spawn(process.execPath, [SERVER_FILE], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(baseUrl, child);

      const stats = await fetchWithTimeout(`${baseUrl}/api/links/${codigo}/stats`);
      const body = await readJson(stats);

      assert.equal(stats.status, 200);
      assert.equal(body.url, 'https://restart.example');
      assert.equal(body.clicks, 2);
    } finally {
      if (child) {
        await stopServer(child);
      }
      await fs.writeFile(DB_FILE, originalDb);
    }
  });

  test('server listens on the PORT environment variable', async () => {
    const port = await getAvailablePort();

    await withServer({ port }, async ({ baseUrl }) => {
      const response = await fetchWithTimeout(`${baseUrl}/`);
      assert.equal(response.status, 200);
    });
  });

  test('server fails visibly instead of starting healthy when storage cannot be initialized', async () => {
    const originalDb = await fs.readFile(DB_FILE, 'utf8');
    await fs.writeFile(DB_FILE, '{ this is not json');

    const child = spawn(process.execPath, [SERVER_FILE], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(await getAvailablePort()) },
      stdio: ['ignore', 'ignore', 'pipe']
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.notEqual(child.exitCode, null, 'server should exit when storage cannot be initialized');
      assert.notEqual(child.exitCode, 0);
    } finally {
      await stopServer(child);
      await fs.writeFile(DB_FILE, originalDb);
    }
  });

  test('GET / serves a main UI that posts URLs and handles success and error states', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const response = await fetchWithTimeout(`${baseUrl}/`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /<form[^>]+id=["']form["']/);
      assert.match(html, /fetch\(["']\/api\/links["']/);
      assert.match(html, /window\.location\.origin\s*\+\s*data\.corta/);
      assert.match(html, /res\.ok|response\.ok/);
      assert.match(html, /error|Error|mensaje|alert/);
    });
  });

  test('GET /stats.html serves a stats UI that fetches real data and does not show stale mock results', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const response = await fetchWithTimeout(`${baseUrl}/stats.html`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /<form[^>]+id=["']form-stats["']/);
      assert.match(html, /\/api\/links\//);
      assert.match(html, /\/stats/);
      assert.doesNotMatch(html, />\s*123\s*</);
      assert.match(html, /res\.ok|response\.ok/);
      assert.match(html, /error|Error|mensaje|alert/);
    });
  });
}
