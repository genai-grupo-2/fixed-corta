const path = require('path');
const { crearApp } = require('./app');
const { crearAlmacenJson } = require('./almacen/json');
const { crearAlmacenPostgres } = require('./almacen/postgres');

const puerto = process.env.PORT || 3000;

// PostgreSQL es el almacen de produccion. Se elige solo, por la presencia de
// DATABASE_URL, para que el desarrollo local y la suite de tests sigan corriendo
// contra el archivo JSON sin necesitar una base levantada.
function elegirAlmacen() {
  if (process.env.DATABASE_URL) {
    return crearAlmacenPostgres({ connectionString: process.env.DATABASE_URL });
  }

  // DB_FILE apunta al volumen persistente cuando el archivo JSON se usa en
  // Railway. Sin la variable se usa el links.json del repo.
  const dbFile = process.env.DB_FILE
    ? path.resolve(process.env.DB_FILE)
    : path.join(__dirname, 'links.json');

  return crearAlmacenJson({ dbFile });
}

async function main() {
  const almacen = elegirAlmacen();
  const { inicializado } = await almacen.iniciar();

  if (inicializado) {
    console.log(`Almacen inicializado: ${almacen.descripcion}`);
  }

  const servidor = crearApp({ almacen }).listen(puerto, () => {
    console.log(`Corta escuchando en el puerto ${puerto} (almacen: ${almacen.descripcion})`);
  });

  // Railway manda SIGTERM antes de reemplazar el contenedor. Sin esto el pool de
  // PostgreSQL queda con conexiones abiertas hasta que la base las expira.
  for (const senal of ['SIGTERM', 'SIGINT']) {
    process.once(senal, () => {
      servidor.close(async () => {
        await almacen.cerrar();
        process.exit(0);
      });
    });
  }
}

main().catch((error) => {
  console.error('No se pudo iniciar Corta:', error.message);
  process.exit(1);
});
