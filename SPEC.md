# Especificación funcional de Corta

## 1. Propósito y alcance

Corta es un acortador de URLs interno. Permite registrar una URL de destino, obtener un enlace corto, usar ese enlace para navegar al destino y consultar estadísticas reales del enlace.

Este documento define el comportamiento observable que debe cumplir la aplicación. Es la fuente de verdad para los tests y para la implementación. Las diferencias conocidas entre este contrato y el código heredado se registran al final y no forman parte del comportamiento aceptado.

## 2. Conceptos y modelo de datos

Cada enlace almacenado contiene, como mínimo:

- `codigo`: identificador corto único, de exactamente 3 caracteres.
- `url`: URL original a la que debe redirigir el enlace.
- `clicks`: entero no negativo que indica cuántas redirecciones válidas se realizaron.
- `creado`: fecha y hora de creación en formato ISO 8601 y zona UTC.

Los códigos generados automáticamente usan únicamente letras minúsculas de `a` a `z` y dígitos de `0` a `9`. Por lo tanto, existen `36³` combinaciones posibles.

La unicidad de `codigo` es una invariancia del sistema: nunca pueden coexistir dos enlaces con el mismo código.

## 3. Reglas generales de la API

- Los cuerpos de entrada y salida de la API usan JSON y UTF-8.
- Las respuestas JSON incluyen `Content-Type: application/json`.
- Los errores de endpoints bajo `/api` tienen la forma `{ "error": "mensaje" }`.
- Una petición inválida no crea ni modifica enlaces.
- Los errores internos no deben exponer credenciales, rutas del servidor ni detalles sensibles.
- Las fechas públicas se expresan como cadenas ISO 8601 UTC.

## 4. Crear un enlace corto

### `POST /api/links`

Registra una URL y genera un código corto único.

### Entrada

```json
{
  "url": "https://ejemplo.com/recurso"
}
```

### URL válida

Una URL es válida cuando:

- `url` está presente y es una cadena no vacía después de quitar espacios en los extremos;
- puede interpretarse como una URL absoluta;
- usa el protocolo `http:` o `https:`;
- contiene un hostname.

No se aceptan URLs relativas ni protocolos como `javascript:`, `data:`, `file:` o `ftp:`. La URL validada se almacena sin espacios exteriores. Corta no necesita comprobar que el destino esté disponible al momento de crear el enlace.

### Respuesta exitosa

- Estado: `201 Created`.
- Cuerpo:

```json
{
  "codigo": "a3k",
  "corta": "/a3k"
}
```

El enlace queda persistido con `clicks` igual a `0` y `creado` igual al instante de creación.

Crear dos veces la misma URL está permitido. Cada petición crea un registro independiente y recibe un código distinto.

### Errores de entrada

- Si falta `url`, no es una cadena, está vacía o no cumple las reglas de URL válida: `400 Bad Request`.
- El cuerpo contiene un mensaje de error comprensible y no se crea ningún registro.

### Colisiones de código

Antes de guardar, el servidor debe comprobar que el código generado no exista. Si existe, debe generar otro y volver a comprobarlo. Una colisión nunca puede sobrescribir un enlace ni crear dos registros ambiguos.

La persistencia debe reforzar la unicidad del código para evitar duplicados incluso ante peticiones concurrentes. Si no pudiera obtenerse un código disponible, la operación falla sin crear datos parciales y responde `503 Service Unavailable`.

## 5. Usar un enlace corto

### `GET /:codigo`

Busca el código y, si existe, dirige al usuario a su URL original.

### Respuesta exitosa

- Estado: `302 Found`.
- El encabezado `Location` contiene la URL original exacta almacenada.
- Antes de completar la respuesta, `clicks` se incrementa en uno y el nuevo valor queda persistido.

Cada petición válida a esta ruta cuenta exactamente un clic. Dos peticiones válidas, incluso concurrentes, deben producir un aumento total de dos sin perder incrementos.

No cuentan como clic:

- consultar estadísticas;
- crear un enlace;
- cargar páginas o recursos estáticos;
- pedir un código inexistente;
- una operación que no haya podido persistir el incremento.

### Código inexistente

- Estado: `404 Not Found`.
- No se modifica ningún contador.
- La respuesta informa que el enlace no existe y no redirige.

## 6. Consultar estadísticas

### `GET /api/links/:codigo/stats`

Devuelve las estadísticas actuales de un enlace sin incrementar sus clics.

### Respuesta exitosa

- Estado: `200 OK`.
- Cuerpo:

```json
{
  "codigo": "a3k",
  "url": "https://ejemplo.com/recurso",
  "clicks": 42,
  "creado": "2026-03-02T14:11:09.000Z"
}
```

`clicks` refleja todas las redirecciones que fueron persistidas antes de la consulta. Consultar este endpoint repetidamente devuelve el mismo contador mientras no haya nuevas redirecciones.

### Código inexistente

- Estado: `404 Not Found`.
- Cuerpo JSON con un campo `error`.

## 7. Interfaz web

### Página principal

- `GET /` sirve la interfaz para acortar URLs.
- El formulario envía la URL a `POST /api/links`.
- Ante éxito, muestra un enlace absoluto formado con el origen actual y el valor `corta` de la API.
- El enlace mostrado puede abrirse y copiarse.
- Ante error, la página muestra un mensaje y no presenta un enlace inexistente o construido con datos indefinidos.

### Página de estadísticas

- `GET /stats.html` sirve la interfaz de estadísticas.
- El usuario puede ingresar un código corto.
- El formulario consulta `GET /api/links/:codigo/stats`.
- Ante éxito, muestra los clics, la URL original y la fecha real de creación recibidos del servidor.
- Los valores maquetados o de ejemplo nunca se presentan como datos reales.
- Ante un código inexistente o un error de red, muestra un mensaje comprensible y no conserva estadísticas anteriores que puedan confundirse con el nuevo resultado.

## 8. Persistencia y consistencia

- En producción, enlaces, fechas y clics deben almacenarse en una base de datos persistente.
- Los datos deben sobrevivir al reinicio y al redeploy del servicio.
- La conexión se configura mediante variables de entorno; las credenciales no se incluyen en código, archivos versionados, mensajes de error ni logs.
- La creación del enlace y la asignación de su código deben ser consistentes: no puede quedar un registro incompleto.
- El incremento de clics debe ser atómico para no perder visitas concurrentes.
- La base de datos debe imponer unicidad sobre `codigo` y no depender solamente de una comprobación previa en la aplicación.

## 9. Configuración de ejecución

- El puerto se toma de la variable de entorno `PORT` cuando esté definida.
- Para desarrollo local puede usarse `3000` como valor predeterminado.
- El proceso debe fallar de forma visible si no puede inicializar su almacenamiento; no debe iniciar aparentando estar sano si no puede leer o guardar datos.

## 10. Criterios mínimos de prueba

La batería automatizada derivada de esta especificación debe cubrir, como mínimo:

1. Creación exitosa con URL HTTP y HTTPS.
2. Rechazo de URL ausente, vacía, no textual, relativa o con protocolo no permitido.
3. Forma y estado de la respuesta de creación.
4. Inicialización de `clicks` y `creado`.
5. Reintento cuando el generador produce un código ya existente.
6. Imposibilidad de persistir códigos duplicados ante concurrencia.
7. Redirección HTTP real con encabezado `Location`.
8. Incremento persistente de exactamente un clic por redirección.
9. Incrementos concurrentes sin pérdida.
10. `404` para una ruta corta inexistente sin cambios de datos.
11. Estadísticas correctas para un código existente.
12. Consulta de estadísticas sin incrementar clics.
13. `404` JSON para estadísticas de un código inexistente.
14. Interfaz principal mostrando éxito y error correctamente.
15. Interfaz de estadísticas reemplazando la maqueta por datos reales y limpiando resultados obsoletos ante error.
16. Persistencia de enlaces y clics después de reiniciar o redesplegar el servicio.

## 11. Diferencias conocidas del código heredado

Al redactar esta primera versión se observaron las siguientes diferencias respecto del contrato:

- La ruta corta responde con el texto de la URL en vez de emitir una redirección HTTP.
- El contador se incrementa en memoria pero no se guarda, por lo que las estadísticas no podrían reflejar esos clics.
- La generación no detecta ni resuelve códigos repetidos.
- No existe `GET /api/links/:codigo/stats`.
- `stats.html` contiene números de maqueta y no consulta la API.
- El servidor solo comprueba que `url` tenga algún valor; no valida protocolo ni estructura.
- El puerto está fijado en `3000` y no respeta `PORT`.
- El almacenamiento actual es un archivo JSON local y no garantiza persistencia de producción ni escrituras concurrentes seguras.
- La prueba existente es un script manual, no una batería automatizada, y todavía asume una respuesta incompatible con una redirección seguida automáticamente.
- Existe una credencial histórica en una nota versionada. Debe tratarse como comprometida, eliminarse del estado publicado y no reutilizarse; su valor no se reproduce en esta especificación.

Estas diferencias son trabajo pendiente para los siguientes milestones. Los tests deben escribirse antes que las correcciones correspondientes.
