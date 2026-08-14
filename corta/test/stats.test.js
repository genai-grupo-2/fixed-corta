const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { crearApp } = require('../app');

function crearBaseTemporal() {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'corta-test-'));
  const archivo = path.join(directorio, 'links.json');
  const links = [{
    codigo: 'a3k',
    url: 'https://ejemplo.com/recurso',
    clicks: 42,
    creado: '2026-03-02T14:11:09.000Z'
  }];

  fs.writeFileSync(archivo, JSON.stringify(links));
  return { archivo, directorio };
}

async function conServidor(app, ejecutar) {
  const servidor = app.listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  const { port } = servidor.address();

  try {
    await ejecutar(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      servidor.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('devuelve las estadísticas reales sin incrementar los clicks', async (t) => {
  const { archivo, directorio } = crearBaseTemporal();
  t.after(() => fs.rmSync(directorio, { recursive: true, force: true }));

  await conServidor(crearApp({ dbFile: archivo }), async (origen) => {
    const respuesta = await fetch(`${origen}/api/links/a3k/stats`);

    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      codigo: 'a3k',
      url: 'https://ejemplo.com/recurso',
      clicks: 42,
      creado: '2026-03-02T14:11:09.000Z'
    });
  });

  const [linkGuardado] = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  assert.equal(linkGuardado.clicks, 42);
});

test('responde 404 JSON cuando el código no existe', async (t) => {
  const { archivo, directorio } = crearBaseTemporal();
  t.after(() => fs.rmSync(directorio, { recursive: true, force: true }));

  await conServidor(crearApp({ dbFile: archivo }), async (origen) => {
    const respuesta = await fetch(`${origen}/api/links/no-existe/stats`);

    assert.equal(respuesta.status, 404);
    assert.match(respuesta.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await respuesta.json(), { error: 'No existe ese link' });
  });
});
