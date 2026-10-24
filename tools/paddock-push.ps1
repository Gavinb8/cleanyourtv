# Windows version of paddock-push.sh: push paddock.config.json, garage.json and prepped photos
# to the box and reload PADDOCK. Needs the photos already prepped: tools\paddock-prep-photos.py first.
#
# Usage: tools\paddock-push.ps1 -TvHost 192.168.1.50
param(
    [string]$TvHost = $env:TV_HOST
)
$ErrorActionPreference = 'Stop'
if (-not $TvHost) { throw 'pass -TvHost <tv ip> or set $env:TV_HOST' }
$env:TV_HOST = $TvHost
Set-Location "$PSScriptRoot\.."

$PY = 'tools\venv\Scripts\python.exe'
if (-not (Test-Path $PY)) { throw 'run: python -m venv tools\venv; tools\venv\Scripts\python.exe -m pip install -r tools\requirements.txt' }

$Pkg = 'com.gavin.paddock'
$Remote = "/sdcard/Android/data/$Pkg/files/paddock"

if (-not (Test-Path 'paddock\paddock.config.json')) { throw 'missing paddock\paddock.config.json' }
if (-not (Test-Path 'paddock\garage.json')) { throw 'missing paddock\garage.json' }

Write-Host 'Pushing config and garage data...'
& $PY -I tools\tv.py "mkdir -p $Remote/photos"
& $PY -I tools\b64push.py paddock\paddock.config.json "$Remote/paddock.config.json"
& $PY -I tools\b64push.py paddock\garage.json "$Remote/garage.json"

$PhotosDir = 'paddock\assets\photos-prepped'
if (Test-Path $PhotosDir) {
    Write-Host "Pushing prepped photos from $PhotosDir..."
    Get-ChildItem "$PhotosDir\*.jpg" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  $($_.Name)"
        & $PY -I tools\b64push.py $_.FullName "$Remote/photos/$($_.Name)"
    }
} else {
    Write-Warning "No $PhotosDir folder - run tools\paddock-prep-photos.py first if you have new photos to push."
}

Write-Host 'Reloading PADDOCK...'
& $PY -I tools\tv.py "am force-stop $Pkg"
& $PY -I tools\tv.py "input keyevent KEYCODE_HOME"
Write-Host 'Done. PADDOCK should come back up with the new data in a couple of seconds.'
