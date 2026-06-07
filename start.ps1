# MC Server Monitor startup script
$ErrorActionPreference = "Stop"

# Kill existing process on port 9000
$pidInfo = netstat -ano | Select-String ":9000" | Select-String "LISTENING"
if ($pidInfo) {
    $processId = ($pidInfo -split '\s+')[-1]
    Write-Host "Port 9000 is in use by PID $processId, killing..." -ForegroundColor Yellow
    Stop-Process -Id $processId -Force
    Start-Sleep -Seconds 1
    Write-Host "Old process terminated." -ForegroundColor Green
}

$venvPath = ".venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating venv..." -ForegroundColor Cyan
    python -m venv $venvPath
}

if (Test-Path "$venvPath\Scripts\python.exe") {
    $pyExe = "$venvPath\Scripts\python.exe"
    $pipExe = "$venvPath\Scripts\pip.exe"
} else {
    $pyExe = "$venvPath/bin/python"
    $pipExe = "$venvPath/bin/pip"
}

Write-Host "Checking dependencies..." -ForegroundColor Cyan
& $pyExe -c "import flask" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    & $pipExe install -r requirements.txt
}

Write-Host ""
Write-Host "MC Server Monitor" -ForegroundColor Green
Write-Host "URL: http://localhost:9000" -ForegroundColor Yellow
Write-Host ""
Write-Host "[1] Foreground (console stays open with logs)" -ForegroundColor White
Write-Host "[2] Background  (close console, server keeps running)" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Select (1/2)"
switch ($choice) {
    "1" {
        Write-Host "Starting in foreground... Press Ctrl+C to stop." -ForegroundColor DarkGray
        & $pyExe app.py
    }
    "2" {
        Write-Host "Starting in background..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath $pyExe -ArgumentList "app.py" -WindowStyle Hidden -PassThru
        Write-Host "Server started (PID: $($proc.Id)). You may close this window." -ForegroundColor Green
    }
    default {
        Write-Host "Invalid choice." -ForegroundColor Red
        pause
    }
}
