const express = require('express');
const path = require('path');
const { generarCodigo } = require('./utils');

const MAX_INTENTOS_CODIGO = 10;

function normalizarUrl(valor) {
  if (typeof valor !== 'string') return undefined;

  const texto = valor.trim();
  if (!texto) return undefined;

  try {
    const url = new URL(texto);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return undefined;
    }
    return texto;
  } catch {
    return undefined;
  }
}

// El almacen se inyecta: puede ser el archivo JSON o PostgreSQL. Sus operaciones
// son asincronicas en los dos casos, asi que hay un solo camino de codigo.
function crearApp({ almacen }) {
  if (!almacen) {
    throw new Error('crearApp necesita un almacen');
  }

  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Express 4 no propaga los rechazos de un handler async al middleware de
  // errores: hay que capturarlos a mano o la peticion queda colgada.
  const asincronico = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  app.post('/api/links', asincronico(async (req, res) => {
    const url = normalizarUrl(req.body?.url);
    if (!url) {
      return res.status(400).json({ error: 'La URL debe ser absoluta y usar http o https' });
    }

    for (let intento = 0; intento < MAX_INTENTOS_CODIGO; intento += 1) {
      const nuevo = {
        codigo: generarCodigo(),
        url,
        clicks: 0,
        creado: new Date().toISOString()
      };

      try {
        await almacen.crear(nuevo);
        return res.status(201).json({ codigo: nuevo.codigo, corta: `/${nuevo.codigo}` });
      } catch (error) {
        if (error.code !== 'CODIGO_DUPLICADO') throw error;
      }
    }

    return res.status(503).json({
      error: 'No fue posible generar un codigo corto disponible'
    });
  }));

  app.get('/api/links', asincronico(async (req, res) => {
    return res.json(await almacen.listar());
  }));

  app.get('/api/links/:codigo/stats', asincronico(async (req, res) => {
    const link = await almacen.buscarPorCodigo(req.params.codigo);

    if (!link) {
      return res.status(404).json({ error: 'No existe ese link' });
    }

    return res.json({
      codigo: link.codigo,
      url: link.url,
      clicks: link.clicks,
      creado: link.creado
    });
  }));

  app.get('/:codigo', asincronico(async (req, res) => {
    const link = await almacen.buscarPorCodigo(req.params.codigo);

    if (!link) {
      return res.status(404).send('No existe ese link');
    }

    // El clic se registra antes de responder: si el incremento falla, no se
    // redirige, asi el contador no puede quedar atrasado respecto de las
    // redirecciones efectivamente servidas.
    await almacen.incrementarClicks(link.codigo);
    return res.redirect(link.url);
  }));

  return app;
}

module.exports = { crearApp, normalizarUrl };
