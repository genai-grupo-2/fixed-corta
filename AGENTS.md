# AGENTS.md

Guía operativa para agentes que trabajan en este repositorio. Documenta los **dos servidores MCP conectados** en la sesión (`github` y `railway`), qué herramientas exponen realmente, cómo usarlas y qué está prohibido hacer sin confirmación explícita.

> Fuentes: instrucciones publicadas por cada servidor MCP, los esquemas de sus herramientas, y la documentación oficial de Railway (`docs.railway.com/ai/mcp-server`, `/cli/service`, `/integrations/api/manage-services`) leída con `search-docs` / `fetch-docs`.

---

## 1. Contexto de la cuenta

| Qué | Valor |
|---|---|
| Usuario GitHub | `DecoudJuan` (Juan Decoud) |
| Usuario Railway | `decoudjuan` (Juan Decoud) |
| Workspace Railway | `Juan Decoud's Projects` — `85a40838-78dc-4892-9b5a-3fea624f65e8` |
| Proyecto Railway | `secure-benevolence` — `8ec3a23e-8240-41e2-9f8d-6f0d37f445c2` |
| Environment | `production` — `27bacc80-7594-49e6-84a7-86b3f5fc12de` |
| Servicios | `pokedex-api-app` (`2f3186b1-5f10-42b2-9fe2-4b2576262d35`), `Postgres` (`d2e10d6f-ca43-42d3-bfe4-f04cbb311332`) |

`pokedex-api-app` corre con builder **NIXPACKS**, start command `npm run start:prod`, dominio `pokedex-api-app-production.up.railway.app` (puerto 8080) y variables `DATABASE_URL`, `FRONTEND_URL`.

**Estado del source:** históricamente el servicio estuvo enlazado al repo `DecoudJuan/pokedex-api-backend` (branch `main`). Ver §5 para el procedimiento de desconexión.

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

**a) CLI de Railway** (recomendado):
```bash
railway login
railway service source disconnect \
  --service pokedex-api-app \
  --environment production \
  --project 8ec3a23e-8240-41e2-9f8d-6f0d37f445c2
```
Para reconectar: `railway service source connect --repo DecoudJuan/pokedex-api-backend --branch main --service pokedex-api-app`

**b) API pública GraphQL** (`https://backboard.railway.com/graphql/v2`, header `Authorization: Bearer <token>`):
```graphql
mutation serviceDisconnect($id: String!) {
  serviceDisconnect(id: $id) { id }
}
# variables: { "id": "2f3186b1-5f10-42b2-9fe2-4b2576262d35" }
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

La suite de `corta/test.js` fue escrita desde `SPEC.md` con enfoque TDD. Puede fallar contra el código heredado hasta que la implementación cumpla los comportamientos requeridos por la especificación.

---

## 7. Skills

Hay skills locales de repositorio configuradas en `.agents/skills/`. Codex las descubre automáticamente desde el directorio actual hasta la raíz del repo. Antes de usar una skill, leer su `SKILL.md` completo y respetar su contrato operativo.

Skill relevante para este proyecto:

- `tester` (`.agents/skills/tester/SKILL.md`): usarla para crear o actualizar tests derivados de `SPEC.md` con enfoque TDD. Solo debe editar archivos de prueba; no debe modificar código de producción, configuración, documentación, dependencias ni lockfiles.
