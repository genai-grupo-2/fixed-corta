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

Queda disponible en <http://localhost:3000>. El puerto se puede cambiar con `PORT`.

## Estructura

```text
.
├── SPEC.md             Especificación funcional y criterios de prueba
├── corta/
│   ├── public/         Interfaz web y estilos
│   ├── app.js          Rutas y lógica de la API (factory `crearApp`)
│   ├── server.js       Arranque HTTP, resolución de PORT y de DB_FILE
│   ├── links.json      Almacenamiento local transitorio
│   ├── test.js         Suite automatizada derivada de SPEC.md
│   └── utils.js        Generación de códigos cortos
└── README.md
```

## API

- `POST /api/links`: crea un enlace corto.
- `GET /api/links`: devuelve el historial ordenado por fecha de creación.
- `GET /api/links/:codigo/stats`: devuelve URL, fecha de creación y clics.
- `GET /:codigo`: redirige al destino y registra un clic.

El contrato completo, incluidos errores y casos borde, está documentado en [`SPEC.md`](SPEC.md).

## Configuración

Las variables de entorno esperadas están documentadas en [`.env.example`](.env.example). Los valores reales viven únicamente en la configuración de Railway. Los archivos `.env` y las credenciales reales no deben versionarse.

## Deploy

La aplicacion corre en Railway, en el proyecto `secure-benevolence`, environment
`production`.

| Ajuste | Valor |
|---|---|
| Builder | Nixpacks |
| Root directory | `corta` |
| Start command | `npm start` |
| Healthcheck | `/` |
| Puerto | lo inyecta Railway en `PORT` |
| Volumen | montado en `/data` |

### Persistencia

El filesystem del contenedor es efimero: se descarta en cada redeploy. Por eso el
servicio monta un volumen persistente en `/data` y la variable `DB_FILE` apunta a
`/data/links.json`. Sin esa combinacion, los links y sus clics se perderian en
cada deploy.

`corta/server.js` inicializa el archivo con `[]` la primera vez, porque un volumen
recien creado viene vacio.

Esto es un puente, no la solucion final: la version definitiva debe usar
PostgreSQL. El proyecto ya tiene un servicio `Postgres` disponible y
`DATABASE_URL` esta reservada en [`.env.example`](.env.example) para esa
migracion.

## Tests

La suite vive en `corta/test.js` y fue derivada de [`SPEC.md`](SPEC.md) con enfoque TDD.

```bash
cd corta
npm test
```

En PowerShell/Windows, usar `npm.cmd test`.

Los tests describen el contrato del spec, no el estado actual del código: hoy pasan 5 de 12. Lo que falta implementarse está listado en la sección siguiente.

## Pendientes frente al spec

Los siguientes comportamientos están definidos en [`SPEC.md`](SPEC.md) y todavía no se cumplen:

- `GET /:codigo` responde el destino con `res.send` en vez de una redirección real con `Location`.
- El incremento de `clicks` no se persiste: falta guardar después de sumar.
- No hay validación de URL. Se aceptan URLs relativas, vacías y protocolos como `javascript:` o `data:`.
- No hay reintento ante colisión de código generado.
- `public/stats.html` conserva datos de maqueta en vez de consultar la API.
- El almacenamiento sigue siendo un archivo JSON. La versión definitiva debe usar PostgreSQL.

## Seguridad

Las credenciales viven únicamente en variables de entorno o en la configuración segura de la plataforma. Una nota heredada que contenía una credencial histórica fue retirada y ese valor no debe reutilizarse.

