# k3d-portforward.ps1
#
# Starts kubectl port-forwards for the local k3d demo as DETACHED background
# processes, so they keep running even after the terminal/CLI session ends.
#
# Usage:
#   .\scripts\k3d-portforward.ps1                 # Argo CD on 8443, app on 9090
#   .\scripts\k3d-portforward.ps1 -ArgoPort 9443  # custom Argo CD port
#
# After a full machine reboot:
#   k3d cluster start mycluster
#   .\scripts\k3d-portforward.ps1

param(
    [int]$ArgoPort = 8443,
    [int]$AppPort  = 9090
)

$ErrorActionPreference = "Stop"

# Make sure kubectl is found even in a fresh shell where PATH was recently updated.
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [Environment]::GetEnvironmentVariable("Path", "User")

function Start-DetachedPortForward {
    param(
        [string]$Label,
        [string]$PortForwardArgs
    )

    # Skip if a matching kubectl port-forward is already running.
    $running = Get-CimInstance Win32_Process -Filter "Name='kubectl.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*port-forward*$PortForwardArgs*" }

    if ($running) {
        Write-Host "[$Label] already running (PID $($running.ProcessId))"
        return
    }

    $proc = Start-Process -FilePath "kubectl" -ArgumentList $PortForwardArgs -WindowStyle Hidden -PassThru
    Write-Host "[$Label] started (PID $($proc.Id)): kubectl $PortForwardArgs"
}

Start-DetachedPortForward "Argo CD UI" "port-forward svc/argocd-server -n argocd $ArgoPort`:443"
Start-DetachedPortForward "PhotoUp app" "port-forward svc/photoup-app -n photo-up $AppPort`:80"

Write-Host "Verifying..."
Start-Sleep -Seconds 5

$argo = curl.exe -4 -sk -o NUL -w "%{http_code}" "https://127.0.0.1:$ArgoPort"
$app  = curl.exe -4 -s  -o NUL -w "%{http_code}" "http://127.0.0.1:$AppPort/api/health"

Write-Host "Argo CD UI: https://127.0.0.1:$ArgoPort -> HTTP $argo"
Write-Host "App health: http://127.0.0.1:$AppPort/api/health -> HTTP $app"