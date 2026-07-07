# Waits until an Android emulator is online and fully booted.
param(
  [string]$AvdName = "Pixel_10",
  [int]$TimeoutSec = 300
)

$ErrorActionPreference = "Stop"
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
  $androidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
$adb = Join-Path $androidHome "platform-tools\adb.exe"
$emulator = Join-Path $androidHome "emulator\emulator.exe"

if (-not (Test-Path $adb)) { throw "adb not found at $adb" }
if (-not (Test-Path $emulator)) { throw "emulator not found at $emulator" }

# Kill zombie emulator/adb state
Get-Process emulator, "qemu-system*" -ErrorAction SilentlyContinue | Stop-Process -Force
& $adb kill-server | Out-Null
Start-Sleep -Seconds 2
& $adb start-server | Out-Null

$lock = Join-Path $env:USERPROFILE ".android\avd\$AvdName.avd\multiinstance.lock"
if (Test-Path $lock) { Remove-Item $lock -Force }

$existing = (& $adb devices) | Select-String "emulator-\d+\s+device"
if (-not $existing) {
  Write-Host "[wait-for-emulator] Starting $AvdName (cold boot)..."
  Start-Process -FilePath $emulator -ArgumentList @("-avd", $AvdName, "-no-snapshot-load") | Out-Null
}

Write-Host "[wait-for-emulator] Waiting for device..."
& $adb wait-for-device

$deadline = (Get-Date).AddSeconds($TimeoutSec)
do {
  $state = (& $adb devices) | Select-String "emulator-\d+\s+device"
  if ($state) {
    $boot = (& $adb shell getprop sys.boot_completed 2>$null).Trim()
    if ($boot -eq "1") {
      Write-Host "[wait-for-emulator] Ready."
      & $adb devices -l
      exit 0
    }
    Write-Host "[wait-for-emulator] Booting... sys.boot_completed=$boot"
  } else {
    $offline = (& $adb devices) | Select-String "offline"
    if ($offline) {
      Write-Host "[wait-for-emulator] Device offline, restarting adb..."
      & $adb kill-server | Out-Null
      Start-Sleep -Seconds 2
      & $adb start-server | Out-Null
      & $adb wait-for-device
    }
  }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

Write-Host "[wait-for-emulator] TIMEOUT"
& $adb devices -l
exit 1