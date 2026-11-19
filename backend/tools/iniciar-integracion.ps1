# Docker Desktop / PowerShell. Ejecutar desde cualquier carpeta:
# .\backend\tools\iniciar-integracion.ps1 [-InicializarEsquema] [-SinFrontend]
param(
    [switch]$InicializarEsquema,
    [switch]$SinFrontend,
    [switch]$UsuariosQa,
    [switch]$InfraExistente
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendEnv = Join-Path $root 'backend\.env'

# En workstation se usa FWizav/FrontendTitec, NO nuestra copia frontend/.
# Aun si omiten -SinFrontend, -InfraExistente evita construir un segundo front.
if ($InfraExistente -and -not $SinFrontend) {
    Write-Warning 'Workstation compartida: se omite el frontend local Auth (3001). Utiliza FrontendTitec del Platform Team (3000).'
    $SinFrontend = $true
}

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

function Run-Docker {
    param([Parameter(Mandatory=$true)][string[]]$ArgsDocker)
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker @ArgsDocker
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($exitCode -ne 0) { throw "Docker fallo con salida $exitCode : docker $($ArgsDocker -join ' ')" }
}

if (-not (Test-DockerCommand -ArgsDocker @('info'))) { throw 'Docker Desktop no esta activo.' }
foreach ($item in @('backend\.env', 'backend\private.pem', 'backend\public.pem')) {
    if (-not (Test-Path (Join-Path $root $item))) { throw "Falta $item. Lee README-PARCHE-AUTH-DOCKER.md." }
}
$envText = Get-Content -Raw $backendEnv
foreach ($key in @('KEYCLOAK_ADMIN_PASSWORD', 'KEYCLOAK_CLIENT_SECRET', 'INTERNAL_API_KEY')) {
    $pattern = '(?m)^' + [regex]::Escape($key) + '=(.+)$'
    $match = [regex]::Match($envText, $pattern)
    if (-not $match.Success -or $match.Groups[1].Value -match 'CONFIGURAR_EN_ENTORNO|^\s*["'']?\s*$') {
        throw "Define $key en backend/.env con un valor real, nunca un placeholder."
    }
}

if (-not (Test-DockerCommand -ArgsDocker @('network','inspect','plataforma-eventos-net'))) {
    if ($InfraExistente) { throw 'No existe la red compartida; coordina con plataforma.' }
    Run-Docker -ArgsDocker @('network','create','plataforma-eventos-net')
}
$infra = Join-Path $root 'backend\docker-compose.yml'
$auth = Join-Path $root 'backend\docker-compose.auth-service.yml'
$front = Join-Path $root 'frontend\docker-compose.yml'

Write-Host '[1/5] Verificando PostgreSQL y Keycloak (sin eliminar volumenes)...'
Run-Docker -ArgsDocker @('compose','-f',$infra,'config','--quiet')
Run-Docker -ArgsDocker @('compose','-f',$auth,'config','--quiet')
if ($InfraExistente) {
    $runningInfra = @(& docker ps --format '{{.Names}}')
    foreach ($nombre in @('ticketu-db', 'ticketu-keycloak', 'ticketu-rabbitmq')) {
        if ($runningInfra -notcontains $nombre) { throw "Falta $nombre; consulta al ayudante antes de iniciar servicios ajenos." }
    }
    Write-Host 'Infraestructura compartida existente: no se recrea PostgreSQL ni Keycloak.'
} else {
    Run-Docker -ArgsDocker @('compose','-f',$infra,'up','-d','db','keycloak')
}

$running = @(& docker ps --format '{{.Names}}')
$existing = @(& docker ps -a --format '{{.Names}}')
if ($running -contains 'ticketu-rabbitmq') {
    Write-Host '[2/5] RabbitMQ existente detectado; no se duplica.'
} elseif ($existing -contains 'ticketu-rabbitmq') {
    throw 'ticketu-rabbitmq existe pero esta detenido. Comprueba quien lo administra antes de iniciarlo.'
} else {
    if ($InfraExistente) { throw 'Falta RabbitMQ compartido; no se levanta un segundo broker.' }
    Write-Host '[2/5] Iniciando broker de desarrollo propio.'
    Run-Docker -ArgsDocker @('compose','-f',$infra,'up','-d','rabbitmq')
}
$networkMembers = @(& docker network inspect plataforma-eventos-net --format '{{range .Containers}}{{println .Name}}{{end}}')
if ($networkMembers -notcontains 'ticketu-rabbitmq') {
    if ($InfraExistente) { throw 'RabbitMQ no esta en la red compartida. Coordina con plataforma.' }
    Run-Docker -ArgsDocker @('network','connect','plataforma-eventos-net','ticketu-rabbitmq')
}

# Comprobar servicios listos: el arranque del contenedor no asegura el broker operativo.
$postgresReady = $false
$brokerReady = $false
for ($i = 0; $i -lt 70; $i++) {
    if (Test-DockerCommand -ArgsDocker @('exec','ticketu-db','pg_isready','-U','admin','-d','ticketu')) { $postgresReady = $true }
    if (Test-DockerCommand -ArgsDocker @('exec','ticketu-rabbitmq','rabbitmq-diagnostics','-q','ping')) { $brokerReady = $true }
    if ($postgresReady -and $brokerReady) { break }
    Start-Sleep -Seconds 2
}
if (-not $postgresReady) { throw 'PostgreSQL no responde. Revisa docker logs ticketu-db.' }
if (-not $brokerReady) { throw 'RabbitMQ no responde. Revisa docker logs ticketu-rabbitmq.' }

Write-Host '[3/5] Comprobando importacion automatica del realm...'
$realmUrl = 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
$ready = $false
for ($i = 0; $i -lt 75; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $realmUrl -UseBasicParsing -TimeoutSec 4
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { throw 'El realm no responde. Ejecuta: docker logs --tail 100 ticketu-keycloak' }

if ($InicializarEsquema) {
    Write-Host '[4/5] Preparando Prisma en BD (solicitado). Haz respaldo si contiene datos.'
    Run-Docker -ArgsDocker @('compose','-f',$auth,'run','--rm','prisma-init')
} else {
    Write-Host '[4/5] Esquema Prisma sin modificaciones. En instalacion nueva utiliza -InicializarEsquema.'
}
Run-Docker -ArgsDocker @('compose','-f',$auth,'up','-d','--build','auth-service')

if ($UsuariosQa) {
    Write-Host '[QA] Creando/verificando nueve cuentas QA...'
    $qaAuthListo = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:10000/api/health' -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $qaAuthListo = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $qaAuthListo) { throw 'Auth no esta listo para el seed QA.' }
    $prevQa = $env:QA_SEED_ALLOW
    try {
        $env:QA_SEED_ALLOW = 'SI'
        Run-Docker -ArgsDocker @('compose','-f',$auth,'--profile','qa','run','--rm','--build','qa-seed')
    } finally {
        if ($null -eq $prevQa) { Remove-Item Env:QA_SEED_ALLOW -ErrorAction SilentlyContinue }
        else { $env:QA_SEED_ALLOW = $prevQa }
    }
}

if (-not $SinFrontend) {
    Write-Host '[5/5] Construyendo COPIA LOCAL del frontend Auth (no FrontendTitec compartido)...'
    $oldAuth = $env:NEXT_PUBLIC_AUTH_API_URL
    $oldGateway = $env:NEXT_PUBLIC_GATEWAY_URL
    try {
        if ([string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_AUTH_API_URL)) { $env:NEXT_PUBLIC_AUTH_API_URL = 'http://localhost:8080' }
        if ([string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_GATEWAY_URL)) { $env:NEXT_PUBLIC_GATEWAY_URL = 'http://localhost:8080' }
        Run-Docker -ArgsDocker @('compose','-f',$front,'up','-d','--build','front')
    } finally {
        $env:NEXT_PUBLIC_AUTH_API_URL = $oldAuth
        $env:NEXT_PUBLIC_GATEWAY_URL = $oldGateway
    }
} else { Write-Host '[5/5] Frontend omitido.' }
Write-Host 'Verificar: http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
Write-Host 'Verificar: http://localhost:10000/api/health'
if (-not $SinFrontend) { Write-Host 'Copia local Auth: http://localhost:3001/auth' }
if ($InfraExistente) { Write-Host 'Frontend compartido (si Platform lo desplego): http://localhost:3000/auth' }
