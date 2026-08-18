const express = require('express');
const fs = require('fs');
const path = require('path');
const { generarCodigo } = require('./utils');

function crearApp({ dbFile = path.join(__dirname, 'links.json') } = {}) {
  const app = express();

  function leerLinks() {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  }

  function guardarLinks(links) {
    fs.writeFileSync(dbFile, JSON.stringify(links, null, 2));
  }

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.post('/api/links', (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Falta la url' });
    }

    const links = leerLinks();
    const codigo = generarCodigo();
    const nuevo = {
      codigo,
      url,
      clicks: 0,
      creado: new Date().toISOString()
    };

    links.push(nuevo);
    guardarLinks(links);
    return res.json({ codigo, corta: `/${codigo}` });
  });

  app.get('/api/links', (req, res) => {
    const links = leerLinks()
      .slice()
      .sort((a, b) => new Date(b.creado) - new Date(a.creado));

    return res.json(links);
  });

  app.get('/api/links/:codigo/stats', (req, res) => {
    const links = leerLinks();
    const link = links.find((item) => item.codigo === req.params.codigo);

    if (!link) {
      return res.status(404).json({ error: 'No existe ese link' });
    }

    return res.json({
      codigo: link.codigo,
      url: link.url,
      clicks: link.clicks,
      creado: link.creado
    });
  });

  app.get('/:codigo', (req, res) => {
    const links = leerLinks();
    const link = links.find((item) => item.codigo === req.params.codigo);

    if (!link) {
      return res.status(404).send('No existe ese link');
    }

    link.clicks += 1;
    return res.send(link.url);
  });

  return app;
}

module.exports = { crearApp };
