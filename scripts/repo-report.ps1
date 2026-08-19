<#
.SYNOPSIS
    Actualiza la copia local del repositorio y genera un reporte de cambios con Claude.

.DESCRIPTION
    Pensado para correr desde el Programador de tareas de Windows.
    1. Hace fetch + pull --ff-only de la rama configurada.
    2. Calcula el rango de commits nuevos desde el ultimo reporte generado.
    3. Le pasa los datos de git a `claude -p` (modo headless) para que redacte
       el reporte en Markdown.
    4. Guarda el reporte en reports\ y actualiza el marcador de estado.

    Si Claude no esta disponible, falla o tarda demasiado, el script escribe
    igual un reporte deterministico armado solo con git. La tarea nunca queda
    sin salida.

.NOTES
    Los reportes NO se commitean: reports\ esta en .gitignore.
#>

[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\Users\juand\faculty\genai',
    [string]$Branch   = 'main',
    [string]$Remote   = 'origin',
    [int]$ClaudeTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$ReportDir = Join-Path $RepoPath 'reports'
$StateFile = Join-Path $ReportDir '_ultimo-sha.txt'
$LogFile   = Join-Path $ReportDir '_tarea.log'

if (-not (Test-Path $ReportDir)) {
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Verbose $line
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $output = & git -C $RepoPath @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw ("git {0} fallo con exit code {1}" -f ($GitArgs -join ' '), $LASTEXITCODE)
    }
    return $output
}

# ---------------------------------------------------------------- 1. Contexto

Write-Log "=== Inicio de la corrida ==="

try {
    $headBefore = (Invoke-Git rev-parse HEAD) | Select-Object -First 1
} catch {
    Write-Log "ERROR: $RepoPath no parece un repositorio git valido. $_"
    exit 1
}

# El working tree sucio rompe el pull --ff-only. Avisamos y cortamos limpio.
$dirty = Invoke-Git status --porcelain
if ($dirty) {
    Write-Log "AVISO: hay cambios locales sin commitear. Se intenta el pull igual."
}

# --------------------------------------------------------- 2. Traer del remote

Write-Log "Actualizando desde $Remote/$Branch ..."
try {
    Invoke-Git fetch $Remote --prune --quiet | Out-Null
    Invoke-Git pull --ff-only $Remote $Branch --quiet | Out-Null
    Write-Log "Pull OK."
} catch {
    Write-Log "ERROR en el pull: $_"
    Write-Log "Se genera el reporte igual con lo que haya localmente."
}

$headAfter = (Invoke-Git rev-parse HEAD) | Select-Object -First 1

# --------------------------------------------- 3. Rango de commits a reportar

# Preferimos el SHA del ultimo reporte: asi no perdemos commits si alguien
# hizo un pull manual entre corrida y corrida.
$baseSha = $headBefore
if (Test-Path $StateFile) {
    $saved = (Get-Content $StateFile -Raw).Trim()
    if ($saved) {
        & git -C $RepoPath cat-file -e "$saved^{commit}" 2>$null
        if ($LASTEXITCODE -eq 0) { $baseSha = $saved }
        else { Write-Log "AVISO: el SHA guardado ($saved) ya no existe. Se usa HEAD previo al pull." }
    }
}

$range = "$baseSha..$headAfter"
$newCommits = Invoke-Git log --no-merges --pretty=format:'%H' $range
$commitCount = @($newCommits | Where-Object { $_ }).Count

$stamp      = Get-Date -Format 'yyyy-MM-dd_HHmm'
$fechaLarga = Get-Date -Format 'yyyy-MM-dd HH:mm'
$ReportFile = Join-Path $ReportDir "$stamp-reporte.md"

if ($commitCount -eq 0) {
    Write-Log "Sin commits nuevos. Se escribe reporte breve sin invocar a Claude."
    $sinCambios = @"
# Reporte del repositorio - $fechaLarga

**Repositorio:** ``$Remote/$Branch`` | **HEAD:** ``$($headAfter.Substring(0,7))``

Sin commits nuevos desde el ultimo reporte.
"@
    Set-Content -Path $ReportFile -Value $sinCambios -Encoding utf8
    Set-Content -Path $StateFile -Value $headAfter -Encoding utf8
    Write-Log "Reporte escrito en $ReportFile"
    Write-Log "=== Fin ==="
    exit 0
}

Write-Log "$commitCount commit(s) nuevo(s) en el rango $range."

# ------------------------------------------------- 4. Datos crudos para el LLM

$logDetallado = Invoke-Git log --no-merges $range `
    --pretty=format:'---%nCOMMIT: %h%nAUTOR: %an <%ae>%nFECHA: %ad%nMENSAJE: %s%n%b' `
    --date=format:'%Y-%m-%d %H:%M'

$archivos    = Invoke-Git log --no-merges $range --pretty=format:'COMMIT %h:' --name-status
$resumenDiff = Invoke-Git diff --stat $baseSha $headAfter
$autores     = Invoke-Git shortlog -sn --no-merges $range

$contexto = @"
RANGO: $range
FECHA DE GENERACION: $fechaLarga
RAMA: $Remote/$Branch
CANTIDAD DE COMMITS: $commitCount

=== AUTORES (commits por persona) ===
$($autores -join "`n")

=== COMMITS ===
$($logDetallado -join "`n")

=== ARCHIVOS POR COMMIT (name-status) ===
$($archivos -join "`n")

=== DIFF RESUMIDO (--stat del rango completo) ===
$($resumenDiff -join "`n")
"@

# ------------------------------------------------- 5. Reporte deterministico
# Se usa como fallback si Claude no responde.

$fallback = @"
# Reporte del repositorio - $fechaLarga

**Rango:** ``$range`` | **Commits nuevos:** $commitCount

> Reporte generado sin Claude (no disponible o timeout). Datos crudos de git.

## Autores

``````
$($autores -join "`n")
``````

## Commits

``````
$($logDetallado -join "`n")
``````

## Archivos modificados

``````
$($resumenDiff -join "`n")
``````
"@

# ------------------------------------------------------ 6. Redaccion con Claude

# IMPORTANTE: las instrucciones NO van como argumento de linea de comandos.
# Start-Process en PowerShell 5.1 no entrecomilla los elementos de -ArgumentList
# que contienen espacios, asi que un prompt largo se partiria en palabras sueltas.
# Van por stdin, delante de los datos; el argumento -p es corto y lo entrecomillamos
# a mano mas abajo.
$instrucciones = @'
INSTRUCCIONES
=============
Sos un asistente que redacta el reporte semanal de cambios de un repositorio git
para un equipo de desarrollo. Despues de la linea "DATOS" recibis la salida cruda
de varios comandos de git.

Redacta un reporte en Markdown, en espanol rioplatense, con esta estructura exacta:

1. Un titulo `# Reporte del repositorio - <fecha>`.
2. Una linea de metadatos: rango de commits, cantidad y rama.
3. `## Resumen` - dos o tres oraciones sobre que cambio en el repositorio y por que
   importa. Nada de relleno.
4. `## Commits` - una tabla Markdown con las columnas: Hash | Autor | Fecha | Mensaje.
5. `## Archivos tocados` - agrupados por area o carpeta, indicando si fueron
   agregados, modificados o eliminados, y quien los toco.
6. `## Observaciones` - senala solo cosas que se desprendan de los datos: archivos
   sensibles modificados, cambios grandes, ausencia de tests, patrones raros.
   Si no hay nada que senalar, escribi "Sin observaciones."

Reglas:
- Usa unicamente la informacion que aparece debajo de "DATOS". No inventes commits,
  autores ni archivos.
- No uses herramientas ni leas archivos del disco: todo lo que necesitas esta aca.
- Devolve SOLO el Markdown del reporte. Sin preambulo, sin comentarios tuyos, sin
  preguntas al final, sin bloques de codigo envolviendo todo el reporte.
'@

$entrada = $instrucciones + "`n`nDATOS`n=====`n" + $contexto

$tmpIn  = Join-Path $env:TEMP "repo-report-in-$stamp.txt"
$tmpOut = Join-Path $env:TEMP "repo-report-out-$stamp.txt"
$tmpErr = Join-Path $env:TEMP "repo-report-err-$stamp.txt"

# UTF-8 sin BOM: el BOM se colaria como basura al principio del stdin de claude.
[System.IO.File]::WriteAllText($tmpIn, $entrada, (New-Object System.Text.UTF8Encoding($false)))

$claudeOk = $false
try {
    Write-Log "Invocando claude -p (timeout ${ClaudeTimeoutSeconds}s) ..."
    # Las comillas dobles son parte del valor a proposito: ver el comentario de arriba.
    $claudeArgs = @(
        '-p', '"Segui al pie de la letra las INSTRUCCIONES que encabezan el texto que recibis por entrada estandar."',
        '--output-format', 'text',
        '--permission-mode', 'dontAsk',
        '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task'
    )
    $proc = Start-Process -FilePath 'claude' -ArgumentList $claudeArgs `
        -RedirectStandardInput $tmpIn -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr `
        -NoNewWindow -PassThru

    if (-not $proc.WaitForExit($ClaudeTimeoutSeconds * 1000)) {
        Write-Log "ERROR: claude supero el timeout. Se lo termina."
        try { $proc.Kill() } catch {}
    } else {
        # Start-Process -PassThru no expone ExitCode de forma confiable en
        # PowerShell 5.1 (devuelve $null aunque el proceso haya salido con 0),
        # asi que validamos la salida en si misma en vez del codigo de retorno.
        $salida = Get-Content $tmpOut -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($salida -and $salida.Trim().Length -gt 50) {
            Set-Content -Path $ReportFile -Value $salida.Trim() -Encoding utf8
            $claudeOk = $true
            Write-Log "Reporte redactado por Claude."
        } else {
            $err = Get-Content $tmpErr -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            Write-Log "ERROR: claude no devolvio un reporte utilizable. stderr: $err"
        }
    }
} catch {
    Write-Log "ERROR invocando a claude: $_"
} finally {
    Remove-Item $tmpIn, $tmpOut, $tmpErr -Force -ErrorAction SilentlyContinue
}

if (-not $claudeOk) {
    Set-Content -Path $ReportFile -Value $fallback -Encoding utf8
    Write-Log "Se escribio el reporte de fallback (solo git)."
}

# ------------------------------------------------------------ 7. Cierre

Set-Content -Path $StateFile -Value $headAfter -Encoding utf8
Write-Log "Reporte escrito en $ReportFile"
Write-Log "=== Fin ==="
