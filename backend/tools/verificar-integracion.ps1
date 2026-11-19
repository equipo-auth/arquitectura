# Verificador no destructivo de Auth en Windows PowerShell 5.1/7.
# Sin switches: verifica infraestructura (incluido Gateway), SIN exigir frontend.
# -FrontendComun: frontend oficial FWizav/FrontendTitec (3000).
# -FrontendLocal: copia Next.js de equipo-auth/arquitectura (3001).
param(
    [switch]$FrontendComun,
    [switch]$FrontendLocal
)
$ErrorActionPreference = 'Stop'
if ($FrontendComun -and $FrontendLocal) {
    throw 'Elige solo -FrontendComun o -FrontendLocal.'
}

$items = @(
    @{ Label = 'Keycloak realm'; Url = 'http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration' },
    @{ Label = 'Auth /api/health'; Url = 'http://localhost:10000/api/health' },
    @{ Label = 'Gateway /health'; Url = 'http://localhost:8080/health' }
)

if ($FrontendComun) {
    $items += @{ Label = 'FrontendTitec /auth'; Url = 'http://localhost:3000/auth' }
    $items += @{ Label = 'FrontendTitec login administrativo'; Url = 'http://localhost:3000/auth/admin/login' }
} elseif ($FrontendLocal) {
    $items += @{ Label = 'Auth local /auth'; Url = 'http://localhost:3001/auth' }
    $items += @{ Label = 'Auth local login administrativo'; Url = 'http://localhost:3001/admin/login' }
}

$failed = $false
foreach ($item in $items) {
    try {
        $r = Invoke-WebRequest -Uri $item.Url -UseBasicParsing -TimeoutSec 8
        if ($r.StatusCode -eq 200) {
            Write-Host "OK $($item.Label) HTTP 200"
        } else {
            $failed = $true
            Write-Warning "$($item.Label) HTTP $($r.StatusCode)"
        }
    } catch {
        $failed = $true
        Write-Warning "$($item.Label) NO RESPONDE: $($_.Exception.Message)"
    }
}
if ($failed) { exit 1 }
Write-Host 'Rutas HTTP correctas. Todavia falta verificar login, roles y consumo real del Panel.'
