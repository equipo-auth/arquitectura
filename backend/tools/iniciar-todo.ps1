# Windows / Docker Desktop. Ejecutar desde la raíz del repo o con ruta absoluta.
$ErrorActionPreference = 'Stop'
function Test-DockerCommand {
    param([Parameter(Mandatory=$true)][string[]]$ArgsDocker)
    # PowerShell 5.1 puede interpretar stderr de docker como error terminante.
    # Para los chequeos usamos el codigo de salida sin mostrar secretos.
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker @ArgsDocker 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $previous }
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
if (-not (Test-DockerCommand -ArgsDocker @('info'))) { throw 'Docker Desktop no esta iniciado.' }

$volumeExiste = Test-DockerCommand -ArgsDocker @('volume','inspect','backend_postgres_data')
$contenedorExiste = Test-DockerCommand -ArgsDocker @('inspect','ticketu-db')
$newDb = (-not $volumeExiste) -and (-not $contenedorExiste)

$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) {
    & py -3 backend/tools/preparar-entorno-local.py
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python backend/tools/preparar-entorno-local.py
} else { throw 'Se requiere Python 3 para preparar el entorno.' }
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el entorno.' }

$names = @(& docker ps --format '{{.Names}}')
$brokerExiste = Test-DockerCommand -ArgsDocker @('inspect','ticketu-rabbitmq')
if ($brokerExiste -and $names -notcontains 'ticketu-rabbitmq') {
    $owner = & docker inspect ticketu-rabbitmq --format '{{index .Config.Labels "com.docker.compose.project"}}'
    if ($owner -eq 'backend') {
        & docker start ticketu-rabbitmq | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar RabbitMQ existente.' }
    } else { throw "RabbitMQ detenido pertenece a '$owner'; inícialo desde ese proyecto." }
}

if ($newDb) {
    Write-Host 'Instalacion nueva: preparando esquema Prisma una vez.'
    & (Join-Path $root 'backend\tools\iniciar-integracion.ps1') -InicializarEsquema
} else {
    Write-Host 'Instalacion existente: no se modifica el esquema Prisma.'
    & (Join-Path $root 'backend\tools\iniciar-integracion.ps1')
}
if (-not $?) { throw 'Fallo el arranque de integracion.' }
& (Join-Path $root 'backend\tools\verificar-integracion.ps1')
if (-not $?) { throw 'Fallo la verificacion HTTP.' }
