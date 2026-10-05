# Idle-CPU sampler - TotalProcessorTime-delta method (per the 2026-10 audit).
# Usage: .\measure-idle.ps1 -Seconds 60 -IntervalSec 2 -Label "S2-paused-track"
# Samples nocturne.exe and its WebView2 child processes every IntervalSec and
# reports median/mean %CPU per process role (browser, gpu, renderer).

param(
  [int]$Seconds = 60,
  [int]$IntervalSec = 2,
  [string]$Label = 'sample'
)

$ErrorActionPreference = 'Stop'
$cores = [Environment]::ProcessorCount

$app = Get-Process -Name 'nocturne' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $app) { throw 'nocturne.exe is not running' }
$appPid = $app.Id

# Build the WebView2 process set for this app (browser proc + its descendants).
$all = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Select-Object ProcessId, ParentProcessId, CommandLine
$browser = $all | Where-Object { $_.ParentProcessId -eq $appPid } | Select-Object -First 1
if (-not $browser) { throw 'no WebView2 browser process found under nocturne.exe' }
$webviewPids = @($browser.ProcessId)
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($p in $all) {
    if ($webviewPids -notcontains $p.ProcessId -and $webviewPids -contains $p.ParentProcessId) {
      $webviewPids += $p.ProcessId
      $changed = $true
    }
  }
}

function RoleOf($proc) {
  if ($null -eq $proc) { return 'unknown' }
  $cmd = $proc.CommandLine
  if ($cmd -match '--type=gpu') { return 'gpu' }
  if ($cmd -match '--type=renderer') { return 'renderer' }
  if ($cmd -match '--type=') { return 'other' }
  return 'browser'
}

$procs = @{}
foreach ($p in $all) { if ($webviewPids -contains $p.ProcessId) { $procs[$p.ProcessId] = $p } }

function Snapshot() {
  $s = @{}
  $app2 = Get-Process -Id $appPid
  $s[$appPid] = $app2.TotalProcessorTime.TotalMilliseconds
  foreach ($id in $webviewPids) {
    $wp = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($wp) { $s[$id] = $wp.TotalProcessorTime.TotalMilliseconds }
  }
  return $s
}

$prev = Snapshot
$rows = New-Object System.Collections.Generic.List[object]
$intervals = [math]::Floor($Seconds / $IntervalSec)
for ($i = 0; $i -lt $intervals; $i++) {
  Start-Sleep -Seconds $IntervalSec
  $cur = Snapshot
  foreach ($id in @($cur.Keys)) {
    if ($prev.ContainsKey($id)) {
      $deltaMs = $cur[$id] - $prev[$id]
      $pct = [math]::Round(100 * $deltaMs / ($IntervalSec * 1000 * $cores), 2)
      $role = if ($id -eq $appPid) { 'app' } else { RoleOf $procs[$id] }
      $rows += [pscustomobject]@{ Label = $Label; Interval = $i + 1; Pid = $id; Role = $role; CpuPct = $pct }
    }
  }
  $prev = $cur
}

$out = Join-Path $PSScriptRoot ("idle-measure-" + $Label + ".csv")
$rows | Export-Csv -NoTypeInformation -Path $out

Write-Host "=== $Label : median %CPU per role over $intervals intervals ==="
$rows | Group-Object Role | ForEach-Object {
  $sorted = $_.Group.CpuPct | Sort-Object
  $n = $sorted.Count
  $med = if ($n % 2) { $sorted[[int](($n - 1) / 2)] } else { ($sorted[$n / 2 - 1] + $sorted[$n / 2]) / 2 }
  $avg = ($_.Group.CpuPct | Measure-Object -Average).Average
  $max = ($_.Group.CpuPct | Measure-Object -Maximum).Maximum
  [pscustomobject]@{ Role = $_.Name; Median = $med; Mean = [math]::Round($avg, 2); Max = $max }
} | Sort-Object Role | Format-Table -AutoSize
Write-Host "saved: $out"
