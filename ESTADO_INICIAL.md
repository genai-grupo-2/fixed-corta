# Estado inicial de Corta

Este documento describe cómo recibió el equipo la aplicación antes de comenzar
su ordenamiento, corrección y despliegue. No es una reconstrucción posterior: la
fuente principal es el primer commit del repositorio, que conserva el punto de
partida original.

## Evidencia de referencia

- **Commit inicial:** `3a82805054e0626df6b067ce926e8231c96d9f6c`
- **Fecha:** 12 de agosto de 2026
- **Mensaje:** `Initial commit: proyecto corta + documentacion`
- **Contexto de la consigna:** [`mission.md`](mission.md)

La misión indicaba que el proyecto había sido entregado como una carpeta
copiada de la computadora de otro desarrollador: sin historial de Git, sin
README, con archivos duplicados, versiones antiguas, notas sueltas y una
funcionalidad incompleta.

## Estructura recibida

```text
corta/
├── index_v2_FINAL.js
├── links.json
├── links_backup_marzo.json
├── notas.txt
├── package-lock.json
├── package.json
├── public/
│   ├── estilos.css
│   ├── estilos_viejos.css
│   ├── index.html
│   ├── logo (1).png
│   └── stats.html
├── server.js
├── server_OLD.js
├── test.js
└── utils.js
```

Los nombres muestran parte del desorden inicial: coexistían archivos marcados
como `OLD`, `FINAL`, copias de respaldo y estilos viejos, sin documentación que
indicara con certeza cuál era la versión correcta.

## Funcionamiento disponible

La aplicación era un servidor Express que escuchaba siempre en el puerto
`3000`. Permitía:

- recibir una URL mediante `POST /api/links`;
- generar un código corto aleatorio;
- guardar los enlaces en `links.json` mediante operaciones síncronas;
- buscar un código al visitar `GET /:codigo`;
- incrementar el contador de clicks en memoria antes de responder.

La interfaz web tenía un formulario para crear enlaces y un botón para copiar
el resultado. No mostraba historial de enlaces.

## Problemas detectados al recibirlo

### La redirección no redirigía

Al visitar un código corto, `server.js` respondía con el texto de la URL
original mediante `res.send(link.url)`. El navegador no era enviado al destino
con una respuesta HTTP de redirección.

### Los clicks no se persistían

El contador se incrementaba en el objeto leído desde `links.json`, pero el
archivo no se volvía a guardar. El click se perdía al terminar la petición.

### Las estadísticas eran datos ficticios

`public/stats.html` era solamente una maqueta. Mostraba el valor fijo `123` y
no ejecutaba ninguna consulta al servidor. Tampoco existía el endpoint
`GET /api/links/:codigo/stats`.

### No se controlaban las colisiones

El código generado se agregaba directamente al arreglo. No se verificaba si ya
existía, por lo que dos URLs podían recibir el mismo código corto.

### La validación era insuficiente

El backend solo comprobaba que el campo `url` estuviera presente. No validaba
que fuera una URL HTTP o HTTPS y la respuesta de creación no utilizaba el
estado HTTP `201`.

### El almacenamiento no era apto para producción

Todos los datos vivían en un archivo JSON local. Este mecanismo no ofrecía una
solución segura para escrituras concurrentes y no garantizaba persistencia en
un despliegue sin volumen.

### Las pruebas eran manuales e incompletas

`test.js` no era una suite automatizada: era un script que requería levantar el
servidor previamente, hacía dos solicitudes con Axios e imprimía resultados.
Dejaba pendientes las pruebas de clicks y estadísticas.

### Había dependencias y archivos dudosos

El proyecto declaraba `axios`, `lodash` y `moment`, aunque las notas heredadas
indicaban que algunas probablemente no se utilizaban. También había versiones
duplicadas del servidor, almacenamiento y estilos.

### No existía preparación para producción

No había configuración de Railway, base de datos PostgreSQL, variables de
entorno documentadas, healthcheck ni estrategia clara de persistencia.

### Existía una credencial histórica en una nota

`notas.txt` contenía una URL de conexión de un servidor antiguo. Aunque la nota
decía que ese servidor ya no existía, el valor era un secreto y no debía quedar
en el repositorio ni mostrarse en reportes o demostraciones. Por seguridad, este
documento no reproduce la credencial.

## Documentación inicial

La carpeta de la aplicación no incluía un `README.md` ni una especificación
funcional. El comportamiento esperado estaba parcialmente implícito en el
código, en `notas.txt` y en la consigna. Por eso una de las primeras tareas fue
crear [`SPEC.md`](SPEC.md) como fuente de verdad y derivar de ella una suite de
tests automatizados.

## Cómo consultar el estado original

El primer commit permite demostrar cada afirmación sin modificar el working
tree actual:

```bash
# Ver todos los archivos recibidos
git show --stat 3a82805

# Examinar el servidor original
git show 3a82805:corta/server.js

# Examinar la maqueta original de estadísticas
git show 3a82805:corta/public/stats.html

# Comparar el punto de partida con la versión actual
git diff 3a82805..main -- corta
```

No se recomienda mostrar `corta/notas.txt` completo durante una presentación,
porque el historial conserva la credencial antigua mencionada anteriormente.

## Resumen

El equipo recibió un prototipo que podía crear códigos y devolver la URL
asociada, pero no realizaba una redirección real, no persistía clicks, no tenía
estadísticas funcionales, no controlaba colisiones y no estaba preparado para
producción. El primer commit conserva ese estado para que toda la evolución
posterior sea trazable.
