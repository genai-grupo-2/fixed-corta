const fs = require('fs');
const path = require('path');

// Almacen sobre un archivo JSON. Es el backend de desarrollo local y el que usa
// la suite de tests, que escribe y lee corta/links.json directamente. Por eso
// cada operacion vuelve a leer el archivo: no hay cache en memoria que se pueda
// desincronizar de lo que el test dejo en disco.
function crearAlmacenJson({ dbFile = path.join(__dirname, '..', 'links.json') } = {}) {
  function leer() {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  }

  function guardar(links) {
    fs.writeFileSync(dbFile, JSON.stringify(links, null, 2));
  }

  return {
    descripcion: `archivo JSON (${dbFile})`,

    // Un volumen recien montado viene vacio, asi que el archivo puede no existir.
    async iniciar() {
      if (!fs.existsSync(dbFile)) {
        fs.mkdirSync(path.dirname(dbFile), { recursive: true });
        guardar([]);
        return { inicializado: true };
      }
      return { inicializado: false };
    },

    async listar() {
      return leer()
        .slice()
        .sort((a, b) => new Date(b.creado) - new Date(a.creado));
    },

    async buscarPorCodigo(codigo) {
      return leer().find((item) => item.codigo === codigo);
    },

    async crear(link) {
      const links = leer();
      links.push(link);
      guardar(links);
      return link;
    },

    async incrementarClicks(codigo) {
      const links = leer();
      const link = links.find((item) => item.codigo === codigo);
      if (!link) return undefined;

      link.clicks += 1;
      guardar(links);
      return link;
    },

    async cerrar() {}
  };
}

module.exports = { crearAlmacenJson };
