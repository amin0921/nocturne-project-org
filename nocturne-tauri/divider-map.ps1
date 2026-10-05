Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('C:\Users\NovinR\Desktop\nocturne-project-org\nocturne-tauri\divider-hover.png')
# CSS x 850-927 -> image x 2283-2514 (x3); CSS y 216-230 -> image y 78-120
Write-Host 'Columns = CSS x (image x); Rows = CSS y. Values = brightness 0-255.'
$header = '      '
for ($cx = 850; $cx -le 927; $cx += 3) { $header += ('{0,5}' -f $cx) }
Write-Host $header
for ($cy = 216; $cy -le 230; $cy++) {
  $iy = ($cy - 190) * 3 + 1
  $line = ('y=' + $cy + ': ')
  for ($cx = 850; $cx -le 927; $cx += 3) {
    $ix = [math]::Min($bmp.Width - 1, ($cx - 89) * 3 + 1)
    $p = $bmp.GetPixel($ix, $iy)
    $line += ('{0,5}' -f [int]((($p.R + $p.G + $p.B) / 3)))
  }
  Write-Host $line
}
$bmp.Dispose()
