const { Pool } = require('pg');

// codigo es PRIMARY KEY porque SPEC.md declara la unicidad como una invariancia
// del sistema: "nunca pueden coexistir dos enlaces con el mismo codigo". Con la
// restriccion en la base, una colision falla de forma ruidosa en vez de duplicar
// o sobrescribir un registro, que es lo que pasaba con el archivo JSON.
const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS links (
    codigo TEXT PRIMARY KEY,
    url    TEXT        NOT NULL,
    clicks INTEGER     NOT NULL DEFAULT 0,
    creado TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// clicks es INTEGER y no BIGINT a proposito: node-postgres devuelve los BIGINT
// como string para no perder precision, y la API tiene que responder un numero.
function aLink(fila) {
  if (!fila) return undefined;
  return {
    codigo: fila.codigo,
    url: fila.url,
    clicks: fila.clicks,
    // La API expresa las fechas como ISO 8601 UTC. La conversion es explicita
    // para que el formato no dependa de como serialice Date el JSON.stringify.
    creado: fila.creado.toISOString()
  };
}

function crearAlmacenPostgres({ connectionString }) {
  const pool = new Pool({ connectionString });

  return {
    descripcion: 'PostgreSQL',

    async iniciar() {
      await pool.query(ESQUEMA);
      return { inicializado: true };
    },

    async listar() {
      const { rows } = await pool.query(
        'SELECT codigo, url, clicks, creado FROM links ORDER BY creado DESC'
      );
      return rows.map(aLink);
    },

    async buscarPorCodigo(codigo) {
      const { rows } = await pool.query(
        'SELECT codigo, url, clicks, creado FROM links WHERE codigo = $1',
        [codigo]
      );
      return aLink(rows[0]);
    },

    async crear(link) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO links (codigo, url, clicks, creado)
           VALUES ($1, $2, $3, $4)
           RETURNING codigo, url, clicks, creado`,
          [link.codigo, link.url, link.clicks, link.creado]
        );
        return aLink(rows[0]);
      } catch (error) {
        if (error.code === '23505') {
          error.code = 'CODIGO_DUPLICADO';
        }
        throw error;
      }
    },

    // El incremento se hace en la base y no leyendo-sumando-escribiendo desde
    // Node: asi dos redirecciones concurrentes del mismo codigo suman dos clics
    // en vez de pisarse.
    async incrementarClicks(codigo) {
      const { rows } = await pool.query(
        `UPDATE links SET clicks = clicks + 1
         WHERE codigo = $1
         RETURNING codigo, url, clicks, creado`,
        [codigo]
      );
      return aLink(rows[0]);
    },

    async cerrar() {
      await pool.end();
    }
  };
}

module.exports = { crearAlmacenPostgres };
