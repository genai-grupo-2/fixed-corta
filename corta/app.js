const express = require('express');
const path = require('path');
const { generarCodigo } = require('./utils');

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
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Falta la url' });
    }

    const nuevo = {
      codigo: generarCodigo(),
      url,
      clicks: 0,
      creado: new Date().toISOString()
    };

    await almacen.crear(nuevo);
    return res.json({ codigo: nuevo.codigo, corta: `/${nuevo.codigo}` });
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

    // PENDIENTE (ver README): el spec pide un 302 con Location y un clic
    // persistido. Hoy se responde la URL como texto y el incremento se pierde
    // porque nunca se guarda. La migracion a PostgreSQL no cambia esto: el bug
    // vive en este handler, no en el almacen, y se comporta igual con los dos
    // backends.
    link.clicks += 1;
    return res.send(link.url);
  }));

  return app;
}

module.exports = { crearApp };
