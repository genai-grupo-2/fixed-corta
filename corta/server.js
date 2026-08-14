const { crearApp } = require('./app');

const puerto = process.env.PORT || 3000;
const app = crearApp();

app.listen(puerto, () => {
  console.log(`Corta escuchando en http://localhost:${puerto}`);
});
