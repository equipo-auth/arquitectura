$ErrorActionPreference = 'Stop'
$items = @(
    @{ Label='Keycloak realm'; Url='http://localhost:8081/realms/ticketu-realm/.well-known/openid-configuration' },
    @{ Label='Auth /api/health'; Url='http://localhost:10000/api/health' },
    @{ Label='Frontend /auth'; Url='http://localhost:3001/auth' }
)
$failed = $false
foreach ($item in $items) {
    try {
        $r = Invoke-WebRequest -Uri $item.Url -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { Write-Host "OK $($item.Label) HTTP 200" }
        else { $failed = $true; Write-Warning "$($item.Label) HTTP $($r.StatusCode)" }
    } catch {
        $failed = $true
        Write-Warning "$($item.Label) NO RESPONDE: $($_.Exception.Message)"
    }
}
if ($failed) { exit 1 }
Write-Host 'Salud HTTP correcta. Faltan pruebas reales de registro, login e introspeccion desde Entradas.'
