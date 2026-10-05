Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('C:\Users\NovinR\Desktop\nocturne-project-org\nocturne-tauri\divider-strip.png')
$W = $bmp.Width; $H = $bmp.Height
Write-Host ("image: ${W}x${H}")

function RowAvg([System.Drawing.Bitmap]$b, [int]$y, [int]$x0, [int]$x1) {
  $sum = 0.0; $n = 0
  for ($x = $x0; $x -le $x1; $x += 3) {
    $p = $b.GetPixel($x, $y); $sum += ($p.R + $p.G + $p.B) / 3.0; $n++
  }
  return [math]::Round($sum / $n, 1)
}

# Locate bright divider rows: scan all y, report rows whose average brightness is well above row-bg (~21).
Write-Host '--- rows with avg brightness > 25 ---'
for ($y = 0; $y -lt $H; $y++) {
  $a = RowAvg $bmp $y 100 ($W - 100)
  if ($a -gt 25) { Write-Host ("y=" + $y + "  avg=" + $a) }
}

# For each divider-ish y found, trace brightness in 12 buckets across x to find the bolder segment.
Write-Host '--- x-trace (12 buckets) for bright rows ---'
$found = New-Object System.Collections.Generic.List[int]
for ($y = 0; $y -lt $H; $y++) {
  $a = RowAvg $bmp $y 100 ($W - 100)
  if ($a -gt 25) { $found.Add($y) }
}
foreach ($y in $found) {
  $bucketW = [math]::Floor(($W - 60) / 12)
  $vals = @()
  for ($b = 0; $b -lt 12; $b++) {
    $x0 = 30 + $b * $bucketW
    $vals += RowAvg $bmp $y $x0 ($x0 + $bucketW - 1)
  }
  Write-Host ("y=" + $y + ': ' + ($vals -join ' '))
}
$bmp.Dispose()
