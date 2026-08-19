# Corta

Corta es un acortador interno de URLs. Permite crear enlaces cortos, visitar el destino original y, una vez completada la funcionalidad pendiente, consultar estadísticas de uso.

## Estado del proyecto

El repositorio parte de una aplicación heredada y se está llevando progresivamente a producción. [`SPEC.md`](SPEC.md) define el comportamiento esperado y funciona como fuente de verdad para la implementación y los tests.

Actualmente la aplicación usa `corta/links.json` como almacenamiento local transitorio. La versión de producción deberá usar PostgreSQL para que los enlaces y sus clics sobrevivan reinicios y redeploys.

## Requisitos

- Node.js 20 o posterior.
- npm.

## Instalación

```bash
cd corta
npm install
```

## Ejecución local

```bash
npm start
```

La aplicación heredada queda disponible en <http://localhost:3000>.

## Estructura

```text
.
├── SPEC.md             Especificación funcional y criterios de prueba
├── corta/
│   ├── public/         Interfaz web y estilos
│   ├── links.json      Almacenamiento local transitorio
│   ├── server.js       Servidor HTTP y API
│   └── utils.js        Generación de códigos cortos
└── README.md
```

## API prevista

- `POST /api/links`: crea un enlace corto.
- `GET /:codigo`: redirige al destino y registra un clic.
- `GET /api/links/:codigo/stats`: devuelve URL, fecha de creación y clics.

El contrato completo, incluidos errores y casos borde, está documentado en [`SPEC.md`](SPEC.md).

## Configuración

Las variables de entorno esperadas están documentadas en [`.env.example`](.env.example). Los archivos `.env` y las credenciales reales no deben versionarse.

## Tests

El script manual heredado fue retirado. La batería automatizada se incorporará con TDD antes de corregir los errores y completar las estadísticas.

## Seguridad

Las credenciales viven únicamente en variables de entorno o en la configuración segura de la plataforma. Una nota heredada que contenía una credencial histórica fue retirada y ese valor no debe reutilizarse.

