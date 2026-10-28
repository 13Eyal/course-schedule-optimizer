param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $projectId = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-', '').ToLowerInvariant()
} finally { $sha.Dispose() }

function Get-ProjectServer([int]$Port) {
    $connection = [Net.Sockets.TcpClient]::new()
    try {
        if (-not $connection.ConnectAsync('127.0.0.1', $Port).Wait(150)) { return $false }
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
        return ($health.app -eq 'carpedio-schedule-optimizer' -and $health.project_id -eq $projectId)
    } catch { return $false } finally { $connection.Dispose() }
}

try {
    $siteUrl = $null
    foreach ($candidatePort in 8000..8009) {
        if (Get-ProjectServer $candidatePort) {
            $siteUrl = "http://127.0.0.1:$candidatePort/"
            break
        }
    }

    if (-not $siteUrl) {
        $pythonCandidates = @((Join-Path $projectRoot '.venv\Scripts\python.exe'))
        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($pythonCommand -and $pythonCommand.Source -notmatch '\\WindowsApps\\') {
            $pythonCandidates += $pythonCommand.Source
        }
        $pythonCandidates += (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
        $pythonPath = $null
        foreach ($candidate in $pythonCandidates) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                try {
                    & $candidate -B -c 'import sys; assert sys.version_info >= (3, 10); import pandas, openpyxl' 2>$null
                    if ($LASTEXITCODE -eq 0) { $pythonPath = $candidate; break }
                } catch { continue }
            }
        }
        if (-not $pythonPath) {
            throw 'Python 3.10+ with pandas and openpyxl is required. Install Python and run: python -m pip install -r requirements.txt'
        }

        $port = $null
        foreach ($candidatePort in 8000..8009) {
            $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
            try { $probe.Start(); $port = $candidatePort; break } catch { } finally { $probe.Stop() }
        }
        if ($null -eq $port) { throw 'Ports 8000-8009 are busy. Close an unused local server and try again.' }

        $runtimeDir = Join-Path $projectRoot '.runtime'
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
        $serverPath = Join-Path $projectRoot 'web_server.py'
        $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-B', ('"' + $serverPath + '"'), '--port', $port) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log') -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($serverProcess.HasExited) { throw "The server stopped during startup. See $runtimeDir\server-error.log" }
            if (Get-ProjectServer $port) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw "The server did not become ready. See $runtimeDir\server-error.log" }
        $siteUrl = "http://127.0.0.1:$port/"
    }

    Write-Output "Ready: $siteUrl"
    if (-not $NoBrowser) { Start-Process $siteUrl }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
