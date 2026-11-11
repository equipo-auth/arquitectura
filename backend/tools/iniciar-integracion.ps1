# Docker Desktop / PowerShell. Ejecutar desde cualquier carpeta:
# .\backend\tools\iniciar-integracion.ps1 [-InicializarEsquema] [-SinFrontend]
param(
    [switch]$InicializarEsquema,
    [switch]$SinFrontend
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backendEnv = Join-Path $root 'backend\.env'

function Run-Docker {
    param([Parameter(Mandatory=$true)][string[]]$ArgsDocker)
    & docker @ArgsDocker
    if ($LASTEXITCODE -ne 0) { throw "Docker fallo con salida $LASTEXITCODE : docker $($ArgsDocker -join ' ')" }
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no esta activo.' }
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

& docker network inspect plataforma-eventos-net *> $null
if ($LASTEXITCODE -ne 0) { Run-Docker -ArgsDocker @('network', 'create', 'plataforma-eventos-net') }
$infra = Join-Path $root 'backend\docker-compose.yml'
$auth = Join-Path $root 'backend\docker-compose.auth-service.yml'
$front = Join-Path $root 'frontend\docker-compose.yml'

Write-Host '[1/5] Levantando PostgreSQL y Keycloak (sin eliminar volumenes)...'
Run-Docker -ArgsDocker @('compose','-f',$infra,'config','--quiet')
Run-Docker -ArgsDocker @('compose','-f',$auth,'config','--quiet')
Run-Docker -ArgsDocker @('compose','-f',$infra,'up','-d','db','keycloak')

$running = @(& docker ps --format '{{.Names}}')
$existing = @(& docker ps -a --format '{{.Names}}')
if ($running -contains 'ticketu-rabbitmq') {
    Write-Host '[2/5] RabbitMQ existente detectado; no se duplica.'
} elseif ($existing -contains 'ticketu-rabbitmq') {
    throw 'ticketu-rabbitmq existe pero esta detenido. Comprueba quien lo administra antes de iniciarlo.'
} else {
    Write-Host '[2/5] Iniciando broker de desarrollo propio.'
    Run-Docker -ArgsDocker @('compose','-f',$infra,'up','-d','rabbitmq')
}
$networkMembers = @(& docker network inspect plataforma-eventos-net --format '{{range .Containers}}{{println .Name}}{{end}}')
if ($networkMembers -notcontains 'ticketu-rabbitmq') {
    Run-Docker -ArgsDocker @('network','connect','plataforma-eventos-net','ticketu-rabbitmq')
}

# Comprobar servicios listos: el arranque del contenedor no asegura el broker operativo.
$postgresReady = $false
$brokerReady = $false
for ($i = 0; $i -lt 70; $i++) {
    & docker exec ticketu-db pg_isready -U admin -d ticketu *> $null
    if ($LASTEXITCODE -eq 0) { $postgresReady = $true }
    & docker exec ticketu-rabbitmq rabbitmq-diagnostics -q ping *> $null
    if ($LASTEXITCODE -eq 0) { $brokerReady = $true }
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

if (-not $SinFrontend) {
    Write-Host '[5/5] Construyendo frontend para localhost:3001...'
    $oldAuth = $env:NEXT_PUBLIC_AUTH_API_URL
    $oldGateway = $env:NEXT_PUBLIC_GATEWAY_URL
    try {
        $env:NEXT_PUBLIC_AUTH_API_URL = 'http://localhost:10000'
        $env:NEXT_PUBLIC_GATEWAY_URL = 'http://localhost:8080'
        Run-Docker -ArgsDocker @('compose','-f',$front,'up','-d','--build','front')
    } finally {
        $env:NEXT_PUBLIC_AUTH_API_URL = $oldAuth
        $env:NEXT_PUBLIC_GATEWAY_URL = $oldGateway
    }
} else { Write-Host '[5/5] Frontend omitido.' }
Write-Host 'Verificar: http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration'
Write-Host 'Verificar: http://localhost:10000/api/health'
if (-not $SinFrontend) { Write-Host 'Compradores: http://localhost:3001/auth' }
