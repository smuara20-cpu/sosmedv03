# Jalankan dashboard di Windows PowerShell:  .\scripts\run.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$v = (node -v) 2>$null
if (-not $v) { Write-Host "Node.js belum terpasang. Pasang Node 22.13 atau lebih baru dari https://nodejs.org" -ForegroundColor Red; exit 1 }
if (-not (Test-Path node_modules)) { npm install }
if (Test-Path .env) {
  Get-Content .env | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object { $k,$val = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k.Trim(), $val.Trim()) }
}
npm start
