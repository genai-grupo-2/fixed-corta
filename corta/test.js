const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'links.json');
const TEST_PORT = 31234;
const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;
const PRELOAD_FILE = path.join(os.tmpdir(), 'corta-test-preload.js');

const originalDb = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : '[]';

fs.writeFileSync(PRELOAD_FILE, `
const codes = (process.env.CORTA_TEST_CODES || '').split(',').filter(Boolean);
let index = 0;
const utils = require(${JSON.stringify(path.join(ROOT, 'utils.js'))});
if (codes.length > 0) {
  utils.generarCodigo = function generarCodigoDeterministico() {
    return codes[Math.min(index++, codes.length - 1)];
  };
}
`);

function restoreDb() {
  fs.writeFileSync(DB_FILE, originalDb);
}

process.once('exit', restoreDb);

function setLinks(links) {
  fs.writeFileSync(DB_FILE, JSON.stringify(links, null, 2));
}

function readLinks() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

async function waitForServer(child) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 3000) {
    if (child.exitCode !== null) {
      throw new Error(`El servidor terminó antes de aceptar conexiones con código ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${SERVER_URL}/`);
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw lastError || new Error('El servidor no aceptó conexiones a tiempo');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;

  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function withServer(fn, options = {}) {
  const env = { ...process.env, PORT: String(TEST_PORT), DATABASE_URL: '' };
  if (options.codes) {
    env.CORTA_TEST_CODES = options.codes.join(',');
    env.NODE_OPTIONS = `--require ${PRELOAD_FILE}`;
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: 'ignore',
  });

  try {
    await waitForServer(child);
    await fn();
  } finally {
    await stopServer(child);
  }
}

async function postJson(pathname, body) {
  return fetch(`${SERVER_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test.after(() => {
  restoreDb();
  fs.rmSync(PRELOAD_FILE, { force: true });
});

test('POST /api/links crea enlaces HTTP y HTTPS con estado, JSON y metadatos iniciales', async () => {
  setLinks([]);

  await withServer(async () => {
    for (const url of ['http://ejemplo.com/recurso', 'https://ejemplo.com/recurso']) {
      const response = await postJson('/api/links', { url });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.match(response.headers.get('content-type'), /^application\/json\b/);
      assert.match(body.codigo, /^[a-z0-9]{3}$/);
      assert.equal(body.corta, `/${body.codigo}`);

      const saved = readLinks().find((link) => link.codigo === body.codigo);
      assert.ok(saved);
      assert.equal(saved.url, url);
      assert.equal(saved.clicks, 0);
      assert.equal(new Date(saved.creado).toISOString(), saved.creado);
    }
  }, { codes: ['h01', 's02'] });
});

test('POST /api/links permite registrar la misma URL dos veces con códigos distintos', async () => {
  setLinks([]);

  await withServer(async () => {
    const first = await (await postJson('/api/links', { url: 'https://ejemplo.com/repetida' })).json();
    const second = await (await postJson('/api/links', { url: 'https://ejemplo.com/repetida' })).json();

    assert.notEqual(first.codigo, second.codigo);
    assert.equal(readLinks().length, 2);
  }, { codes: ['u01', 'u02'] });
});

test('POST /api/links rechaza URLs ausentes, vacías, no textuales, relativas y protocolos no permitidos sin crear datos', async () => {
  const invalidBodies = [
    {},
    { url: '' },
    { url: '   ' },
    { url: 42 },
    { url: '/relativa' },
    { url: 'javascript:alert(1)' },
    { url: 'data:text/plain,hola' },
    { url: 'file:///tmp/secreto' },
    { url: 'ftp://ejemplo.com/recurso' },
  ];

  setLinks([]);

  await withServer(async () => {
    for (const body of invalidBodies) {
      const response = await postJson('/api/links', body);
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /^application\/json\b/);
      assert.equal(typeof payload.error, 'string');
      assert.equal(readLinks().length, 0);
    }
  });
});

test('POST /api/links recorta espacios exteriores antes de guardar una URL válida', async () => {
  setLinks([]);

  await withServer(async () => {
    const response = await postJson('/api/links', { url: '  https://ejemplo.com/limpia  ' });
    const body = await response.json();
    const saved = readLinks().find((link) => link.codigo === body.codigo);

    assert.equal(response.status, 201);
    assert.equal(saved.url, 'https://ejemplo.com/limpia');
  }, { codes: ['trm'] });
});

test('POST /api/links reintenta si el generador produce un código existente', async () => {
  setLinks([
    { codigo: 'abc', url: 'https://existente.test', clicks: 0, creado: '2026-03-02T14:11:09.000Z' },
  ]);

  await withServer(async () => {
    const response = await postJson('/api/links', { url: 'https://nuevo.test' });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.codigo, 'def');
    assert.deepEqual(readLinks().map((link) => link.codigo).sort(), ['abc', 'def']);
  }, { codes: ['abc', 'def'] });
});

test('POST /api/links no persiste códigos duplicados ante creaciones concurrentes', async () => {
  setLinks([]);

  await withServer(async () => {
    const [first, second] = await Promise.all([
      postJson('/api/links', { url: 'https://uno.test' }),
      postJson('/api/links', { url: 'https://dos.test' }),
    ]);
    const responses = [first, second];
    const savedCodes = readLinks().map((link) => link.codigo);

    assert.equal(new Set(savedCodes).size, savedCodes.length);
    assert.ok(responses.every((response) => response.status === 201 || response.status === 503));
  }, { codes: ['dup'] });
});

test('POST /api/links responde 503 sin datos parciales cuando agota los códigos disponibles', async () => {
  setLinks([
    { codigo: 'dup', url: 'https://existente.test', clicks: 0, creado: '2026-03-02T14:11:09.000Z' },
  ]);

  await withServer(async () => {
    const response = await postJson('/api/links', { url: 'https://nuevo.test' });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(typeof body.error, 'string');
    assert.equal(readLinks().length, 1);
  }, { codes: ['dup'] });
});

test('GET /:codigo responde con redirección real, Location exacto e incrementa un clic persistido', async () => {
  setLinks([
    { codigo: 'r01', url: 'https://destino.test/ruta?q=1', clicks: 0, creado: '2026-03-02T14:11:09.000Z' },
  ]);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/r01`, { redirect: 'manual' });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://destino.test/ruta?q=1');
    assert.equal(readLinks()[0].clicks, 1);
  });
});

test('GET /:codigo conserva todos los incrementos concurrentes', async () => {
  setLinks([
    { codigo: 'cc1', url: 'https://destino.test', clicks: 0, creado: '2026-03-02T14:11:09.000Z' },
  ]);

  await withServer(async () => {
    const responses = await Promise.all(Array.from(
      { length: 20 },
      () => fetch(`${SERVER_URL}/cc1`, { redirect: 'manual' })
    ));

    assert.ok(responses.every((response) => response.status === 302));
    assert.equal(readLinks()[0].clicks, 20);
  });
});

test('GET /:codigo inexistente devuelve 404 sin modificar contadores ni redirigir', async () => {
  const originalLinks = [
    { codigo: 'ok1', url: 'https://destino.test', clicks: 7, creado: '2026-03-02T14:11:09.000Z' },
  ];
  setLinks(originalLinks);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/zzz`, { redirect: 'manual' });

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
    assert.deepEqual(readLinks(), originalLinks);
  });
});

test('GET /api/links/:codigo/stats devuelve estadísticas JSON sin incrementar clics', async () => {
  setLinks([
    { codigo: 'st1', url: 'https://stats.test', clicks: 42, creado: '2026-03-02T14:11:09.000Z' },
  ]);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/api/links/st1/stats`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.deepEqual(body, {
      codigo: 'st1',
      url: 'https://stats.test',
      clicks: 42,
      creado: '2026-03-02T14:11:09.000Z',
    });
    assert.equal(readLinks()[0].clicks, 42);
  });
});

test('GET /api/links/:codigo/stats inexistente devuelve 404 JSON con error', async () => {
  setLinks([]);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/api/links/nope/stats`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    assert.equal(typeof body.error, 'string');
  });
});

test('GET / sirve la interfaz principal conectada a la API y preparada para éxito y error', async () => {
  setLinks([]);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<form[^>]+id="form"/);
    assert.match(html, /fetch\(['"]\/api\/links['"]/);
    assert.match(html, /window\.location\.origin\s*\+\s*data\.corta/);
    assert.match(html, /res\.ok|response\.ok|throw new Error|catch\s*\(/);
  });
});

test('GET /stats.html no muestra datos de maqueta y consulta estadísticas reales limpiando errores', async () => {
  setLinks([]);

  await withServer(async () => {
    const response = await fetch(`${SERVER_URL}/stats.html`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<form[^>]+id="form-stats"/);
    assert.match(html, /\/api\/links\/.*\/stats|`\/api\/links\/\$\{.*\}\/stats`/);
    assert.doesNotMatch(html, />\s*123\s*</);
    assert.match(html, /catch\s*\(|res\.ok|response\.ok/);
    assert.match(html, /textContent\s*=\s*''|innerHTML\s*=\s*''|replaceChildren\(/);
  });
});
