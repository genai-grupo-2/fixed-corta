# AGENTS.md

Guía operativa para agentes que trabajan en este repositorio. Documenta los **dos servidores MCP conectados** en la sesión (`github` y `railway`), qué herramientas exponen realmente, cómo usarlas y qué está prohibido hacer sin confirmación explícita.

> Fuentes: instrucciones publicadas por cada servidor MCP, los esquemas de sus herramientas, y la documentación oficial de Railway (`docs.railway.com/ai/mcp-server`, `/cli/service`, `/integrations/api/manage-services`) leída con `search-docs` / `fetch-docs`.

---

## 1. Contexto de la cuenta

| Qué | Valor |
|---|---|
| Usuario GitHub | `DecoudJuan` (Juan Decoud) |
| Repo | `genai-grupo-2/fixed-corta` |
| Usuario Railway | `julian-ritondale` (Julián Ritondale) |
| Workspace Railway | `Julián Ritondale's Projects` — `83ebe77f-560a-4aab-889d-7032983081fa` |
| Proyecto Railway | `corta` — `ec9a2014-be33-4662-8e4b-f47a1407fb17` |
| Environment | `production` — `365e9350-6e30-4466-9aad-63f068e3e690` |
| Servicio app | `corta` — `5e8ede4d-599a-47f2-a973-2bd48fff3f5c` |
| Dominio | `corta-production-ea3e.up.railway.app` |

El servicio `corta` corre con builder **RAILPACK**, root directory `corta`, start
command `npm start`, healthcheck en `/`, un volumen montado en `/data` y las
variables `DATABASE_URL`, `DB_FILE`, `NODE_ENV`.

**Cuenta anterior:** la documentación previa apuntaba al workspace
`Juan Decoud's Projects`, proyecto `secure-benevolence`
(`8ec3a23e-8240-41e2-9f8d-6f0d37f445c2`), con los servicios `pokedex-api-app` y
`Postgres`. Esa cuenta **no** es la que tiene conectado el MCP: el usuario
autenticado no tiene rol `member` ahí y `create-deployment` falla. El deploy de
Corta vive en el proyecto `corta` de la tabla de arriba.

---

## 2. MCP `github`

Servidor oficial de GitHub. Opera sobre la API remota — **no** toca el filesystem local.

### 2.1 Reglas del servidor (respetarlas siempre)

1. **`list_*` vs `search_*`**: usar `list_*` para recuperación amplia y paginada de un tipo (todos los issues, todas las PRs, todas las branches) con filtros básicos. Usar `search_*` para consultas dirigidas con criterios, keywords o filtros complejos.
2. **Manejo de contexto**: paginar siempre en lotes de **5–10 ítems** (`perPage`). Usar `minimal_output: true` cuando no se necesite el objeto completo de la API.
3. **Orden en búsquedas**: usar los parámetros `sort` y `order`, **nunca** meter `sort:` dentro del query string. El query solo lleva criterios (`org:google language:python`).
4. **`get_me` primero** cuando haga falta conocer permisos o identidad del usuario actual.
5. **Issues**: consultar `list_issue_types` primero en organizaciones. Usar `search_issues` antes de crear uno nuevo para evitar duplicados. Siempre setear `state_reason` al cerrar.
6. **Pull requests**: buscar plantilla (`pull_request_template.md` o `.github/PULL_REQUEST_TEMPLATE/`) antes de crear una PR y usar su estructura.

### 2.2 Inventario de herramientas

**Lectura de repo**
`get_file_contents` · `get_commit` · `list_commits` · `list_branches` · `list_tags` · `get_tag` · `list_releases` · `get_latest_release` · `get_release_by_tag` · `list_repository_collaborators` · `get_teams` · `get_team_members` · `get_label`

**Búsqueda**
`search_code` · `search_repositories` · `search_issues` · `search_pull_requests` · `search_commits` · `search_users`

**Escritura de contenido**
`create_repository` · `fork_repository` · `create_branch` · `create_or_update_file` · `push_files` · `delete_file`

**Issues**
`issue_read` (métodos: `get`, `get_comments`, `get_sub_issues`, `get_parent`, `get_labels`) · `issue_write` (métodos: `create`, `update`) · `add_issue_comment` · `sub_issue_write` · `list_issues` · `list_issue_fields` · `list_issue_types`

**Pull requests**
`list_pull_requests` · `pull_request_read` (métodos: `get`, `get_diff`, `get_status`, `get_files`, `get_commits`, `get_review_comments`, `get_reviews`, `get_comments`, `get_check_runs`) · `create_pull_request` · `update_pull_request` · `update_pull_request_branch` · `merge_pull_request` · `request_copilot_review`

**Reviews**
`pull_request_review_write` (métodos: `create`, `submit_pending`, `delete_pending`, `resolve_thread`, `unresolve_thread`) · `add_comment_to_pending_review` · `add_reply_to_pull_request_comment`

**Seguridad**
`run_secret_scanning`

### 2.3 Flujos canónicos

**Review de PR con comentarios inline** (el orden importa):
1. `pull_request_review_write` con `method: "create"` **sin** `event` → crea un review *pending*.
2. `add_comment_to_pending_review` una vez por comentario, anclado a archivo+línea.
3. `pull_request_review_write` con `method: "submit_pending"` + `body` + `event` (`COMMENT` / `APPROVE` / `REQUEST_CHANGES`).

**Commit de varios archivos**: usar `push_files` (un solo commit, varios paths) en vez de N llamadas a `create_or_update_file`.

**Update de un archivo existente**: `create_or_update_file` **requiere** el blob `sha` del archivo actual. Obtenerlo con `get_file_contents` (o `git rev-parse <branch>:<path>`). El contenido va en texto plano — el servidor hace el base64.

**Leer un diff**: `pull_request_read` con `method: "get_diff"`. Para archivos cambiados con paginación, `method: "get_files"`.

### 2.4 Límites

- No hay operaciones de git local: para trabajar sobre el working tree usar las herramientas de archivo y `git` por shell.
- No hay tool para desvincular repos de servicios externos (eso es del lado de Railway, §5).
- No hay tool de borrado de repos ni de branches.

---

## 3. MCP `railway`

Esta sesión está conectada al **Remote MCP** (`mcp.railway.com`) vía OAuth. Railway también ofrece un **Local MCP** que corre sobre el CLI (`railway setup agent`) y expone un set de herramientas más amplio — ver §5.

### 3.1 Regla de selección de herramienta

Usar las **tools directas** para lecturas y operaciones de rutina: listar proyectos / servicios / variables / dominios, inspeccionar configuración, estado, logs, métricas, setear variables, actualizar settings de servicio, crear servicios y buscar en la documentación.

Reservar **`railway-agent`** para tareas genuinamente complejas o abiertas: debugging multi-servicio, investigación de incidentes, operaciones que abarcan muchos pasos o que necesitan razonamiento del lado de Railway.

Caer al **CLI de Railway** cuando ninguna tool remota cubra la operación.

### 3.2 Inventario de herramientas (Remote MCP disponible acá)

| Área | Herramientas |
|---|---|
| Cuenta | `whoami`, `list-workspaces` |
| Proyectos y servicios | `list-projects`, `create-project`, `list-services`, `create-service`, `get-service-config`, `update-service` |
| Deployments | `list-deployments`, `create-deployment`, `redeploy`, `accept-deploy`, `get-status` |
| Variables | `list-variables`, `set-variables` |
| Dominios | `list-domains`, `generate-domain` |
| Observabilidad | `get-logs`, `get-service-metrics` |
| Feature flags | `list-feature-flags`, `get-feature-flag`, `set-feature-flag`, `delete-feature-flag` |
| Documentación | `search-docs`, `fetch-docs` |
| Agente | `railway-agent` |

Notas de uso:

- `get-service-config` devuelve `source` (repo/imagen), build, deploy, networking, volúmenes y **solo los nombres** de variables. Para valores usar `list-variables`.
- `update-service` cambia build/start/pre-deploy commands, healthcheck, sleep mode, root directory, cron, Dockerfile path, restart policy, config file y watch patterns. **No** maneja escalado (réplicas/regiones) ni cambios de source. Los cambios se aplican en el próximo deploy; usar `redeploy` para aplicarlos ya.
- Si se omite `environmentId`, se usa `production`.
- `search-docs` devuelve secciones con URL; `fetch-docs` trae el markdown completo de una página o slug (`reference/variables`).

**Lo que el Remote MCP NO puede hacer** (verificado en esta sesión, hay que ir al dashboard o al CLI):

- **Crear o montar volúmenes.** No hay tool. `get-service-config` los lee, nada más. Se crean desde el canvas (`Ctrl+K` → *Volume*) o con `railway volume add --mount-path /data --service <svc>`.
- **Agregar una base gestionada.** `create-service` solo levanta un contenedor pelado desde una imagen: sin volumen, sin `POSTGRES_PASSWORD` y sin `DATABASE_URL`. El PostgreSQL gestionado se agrega desde el canvas (`Ctrl+K` → *Database* → *Add PostgreSQL*).
- **Borrar servicios.** No hay `delete-service`, así que un servicio creado por error queda y hay que limpiarlo a mano.
- **`create-deployment` dispara el build antes de que se pueda configurar el servicio.** El root directory se setea con `update-service` recién después, así que el primer deploy de un monorepo falla y hay que hacer `redeploy`.
- **`create-deployment` deja el source sin branch trackeada**, así que el servicio queda sin auto-deploy: ningún push dispara nada. Se arregla con `railway service source connect --repo <owner/repo> --branch main --service <svc>`.
- **`redeploy` no avanza el código.** Reusa el snapshot del build original y queda clavado en ese commit. Para deployar codigo nuevo sin auto-deploy, usar `railway up` desde la raiz del repo.
- **No cambia el source de un servicio.** `update-service` no lo maneja; es CLI o dashboard.

### 3.3 Documentación como primera parada

Antes de improvisar sobre configuración de Railway, consultar `search-docs` → `fetch-docs`. Es más barato y más exacto que adivinar nombres de campos.

---

## 4. Seguridad y confirmaciones

El MCP de Railway ejecuta comandos y llama APIs **en nombre del usuario**. Reglas no negociables:

1. **Confirmar con el usuario antes de acciones destructivas.** En Railway: `accept-deploy` (commitea cambios staged y deploya), `redeploy`, `delete-feature-flag`, borrado de servicios, dominios, volúmenes o buckets, y cualquier invocación de `railway-agent` que vaya a modificar infraestructura.
2. **Nunca volcar valores de variables de entorno** en output, commits, issues o PRs. `get-service-config` deliberadamente devuelve solo nombres — respetar esa separación.
3. **No commitear secretos** vía `push_files` / `create_or_update_file`. Ante la duda, correr `run_secret_scanning`.
4. **Preferir entornos no productivos** cuando exista la opción. Acá solo existe `production`, así que todo cambio impacta producción: avisar antes.
5. **Los tokens de proyecto no sirven** para Remote MCP — requiere identidad de usuario para billing y auditoría.
6. `railway service files delete` se niega a correr si lo invoca un agente: esa operación la hace una persona.

---

## 5. Gestión del source de un servicio (repo GitHub ↔ Railway)

El Remote MCP **no expone** `connect-service-source` / `disconnect-service-source`. Solo el **Local MCP** (sobre CLI) los tiene. Hay tres caminos:

> **Caso real (19/08/2026).** El selector de repos del dashboard **no listaba**
> `genai-grupo-2/fixed-corta`, aun con la GitHub App `railway-app` instalada en la
> org con `repository_selection: all` y con el usuario como admin del repo. La
> causa: Railway asocia cada instalación de la App con la cuenta de Railway que la
> autorizó, y esa instalación la había hecho otra cuenta. Reinstalar desde GitHub
> no arregla nada — la App ya tenía todos los permisos, así que el *Save* es un
> no-op y `updated_at` de la instalación ni se mueve.
>
> **Lo que sí funcionó: `railway service source connect` desde el CLI**, que usa
> el token de la cuenta en vez de la lista cacheada del selector. Ante este
> síntoma, ir directo al CLI y no perder tiempo con permisos de GitHub.

**a) CLI de Railway** (recomendado):
```bash
railway login
railway service source disconnect \
  --service corta \
  --environment production \
  --project ec9a2014-be33-4662-8e4b-f47a1407fb17
```
Para reconectar: `railway service source connect --repo genai-grupo-2/fixed-corta --branch main --service corta`

**b) API pública GraphQL** (`https://backboard.railway.com/graphql/v2`, header `Authorization: Bearer <token>`):
```graphql
mutation serviceDisconnect($id: String!) {
  serviceDisconnect(id: $id) { id }
}
# variables: { "id": "5e8ede4d-599a-47f2-a973-2bd48fff3f5c" }
```
Reconectar: `serviceConnect(id, input: { repo, branch })`.

**c) Dashboard de Railway**: Service → Settings → Source → Disconnect.

**d) `railway-agent`**: puede hacerlo, pero requiere plan pago. En esta cuenta devuelve `Your trial has expired. Please upgrade to use agent features.`

---

## 6. Tests

Para correr la suite automatizada del proyecto Corta:

```powershell
cd corta
npm.cmd test
```

El script `test` está definido en `corta/package.json` y ejecuta:

```bash
node --test test.js
```

En PowerShell/Windows, preferir `npm.cmd test`. El comando `npm test` puede fallar si `npm.ps1` está bloqueado por la política de ejecución del sistema.

La suite de `corta/test.js` fue escrita desde `SPEC.md` con enfoque TDD y describe el contrato del spec, no el estado actual del código. **Hoy pasan 6 de 12.** Los pendientes están listados en la sección *Pendientes frente al spec* del `README.md`.

Los tests corren siempre contra el backend de archivo JSON: levantan `server.js` como subproceso y leen y escriben `corta/links.json` directo. No necesitan PostgreSQL levantado, porque `server.js` elige el backend según haya o no `DATABASE_URL`. **Cuidado:** si tenés `DATABASE_URL` exportada en tu shell, la suite va a correr contra la base y fallar entera.

---

## 7. Skills

Hay skills locales de repositorio configuradas en `.agents/skills/`. Codex las descubre automáticamente desde el directorio actual hasta la raíz del repo. Antes de usar una skill, leer su `SKILL.md` completo y respetar su contrato operativo.

Skills relevantes para este proyecto:

- `test` (`.agents/skills/test/SKILL.md`): usarla para crear o actualizar tests derivados de `SPEC.md` con enfoque TDD. Solo debe editar archivos de prueba; no debe modificar código de producción, configuración, documentación, dependencias ni lockfiles.
- `collect-memory` (`.agents/skills/collect-memory/SKILL.md`): usarla al cerrar una sesión o cuando el equipo pida guardar avances, pendientes, decisiones, bloqueos y preferencias duraderas.

---

## 8. Memoria del proyecto

Actualizada: 2026-08-20.

### Avances verificados

- Milestones 1 y 2 completos en `main`: historia inicial trazable, proyecto ordenado, `README.md`, `.gitignore`, `SPEC.md` y configuración documentada.
- Milestone 4 completo en `main`: endpoint de estadísticas y `stats.html` conectada a datos reales.
- Producción usa PostgreSQL y la aplicación pública responde en `https://corta-production-ea3e.up.railway.app`.
- La prueba pública del milestone 5 creó el código `ytu`, registró una redirección y devolvió `clicks: 1` desde estadísticas.
- El historial de `main` contiene commits de Juan Decoud, Julián Ritondale, candeperles y PiaAndreuccetti.
- En esta computadora existe la tarea semanal `Codex Weekly Repository Changes`, programada los viernes a las 18:00. Se verificó un pull exitoso y un reporte de 10 commits con autores y archivos en el worktree dedicado `.worktrees/team-report`.
- La skill de repositorio `collect-memory` existe en `.agents/skills/collect-memory/` y esta sección es su primera actualización real.

### Trabajo terminado fuera de main

- Milestone 3 completo en la rama remota `fix/milestone-3-completo`, commits `c0bfb6a` y `4b49a05`: validación HTTP/HTTPS, respuesta `201`, reintentos y `503` ante colisiones, unicidad en JSON/PostgreSQL, limpieza de estadísticas y concurrencia de clicks. Resultado verificado: 14/14 tests verdes. Falta revisar y fusionar la rama.

### Pendientes y bloqueos

- Milestone 5: falta hacer un redeploy y comprobar que `ytu` y su click sobreviven. El Railway MCP está autenticado como `piaandreuccetti`, sin rol viewer sobre el proyecto `corta`; se necesita conectar una cuenta con acceso o agregar esa cuenta al proyecto.
- Extra de equipo: falta confirmar o agregar colaboradores. GitHub MCP está autenticado como `PiaAndreuccetti`, pero la organización rechaza el token por su política de duración; renovar el token con vigencia máxima de 366 días.
- Extra de equipo: Juan, Julián y Cande deben configurar y demostrar la tarea programada en sus propias computadoras.

### Decisiones y convenciones duraderas

- `SPEC.md` es la fuente de verdad y las correcciones/features se trabajan con tests primero.
- PostgreSQL es el almacenamiento de producción; JSON queda para desarrollo local y tests.
- Nunca registrar secretos en código, reportes, memoria, issues o PRs.
- Confirmar antes de redeploys u otras acciones destructivas de Railway.
- Preservar cambios locales del equipo; usar worktrees aislados cuando una rama limpia evite interferencias.
- La memoria debe distinguir lo que está en `main`, lo que solo existe en una rama y lo que fue verificado en servicios externos.
