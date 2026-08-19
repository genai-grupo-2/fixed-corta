const fs = require('fs');
const path = require('path');
const { crearApp } = require('./app');

const puerto = process.env.PORT || 3000;

// En Railway el filesystem del contenedor es efimero: se descarta en cada
// redeploy. DB_FILE apunta al archivo dentro del volumen persistente montado
// (ver README, seccion Deploy). Sin la variable, se usa el links.json del repo,
// que es lo que espera el desarrollo local y la suite de tests.
const dbFile = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(__dirname, 'links.json');

// Un volumen recien creado viene vacio, asi que el archivo no existe todavia.
// Lo inicializamos antes de levantar el servidor para que la primera lectura no
// falle. No se toca si ya tiene datos.
if (!fs.existsSync(dbFile)) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(dbFile, '[]');
  console.log(`Base de links inicializada en ${dbFile}`);
}

const app = crearApp({ dbFile });

app.listen(puerto, () => {
  console.log(`Corta escuchando en el puerto ${puerto} (base: ${dbFile})`);
});
