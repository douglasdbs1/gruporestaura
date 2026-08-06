$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $projectRoot 'dist-cloudflare'

if ($outputDir -notlike "$projectRoot\*") {
    throw "Diretorio de saida fora do projeto: $outputDir"
}

if (Test-Path -LiteralPath $outputDir) {
    Remove-Item -LiteralPath $outputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outputDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputDir 'presence') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputDir 'ideologica\css') | Out-Null
New-Item -ItemType Directory -Path (Join-Path $outputDir 'ideologica\js') | Out-Null

$rootFiles = @('index.html', 'auth.js', 'logo.png')
$presenceFiles = @(
    'index.html',
    'admin.html',
    'og-image.png',
    'restaurajeanslogo.png',
    'minhalavanderialogo.png'
)
$ideologicaFiles = @('index.html', 'comparativo.html', 'comparacao-anual.html')

foreach ($file in $rootFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $outputDir
}
foreach ($file in $presenceFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "presence\$file") -Destination (Join-Path $outputDir 'presence')
}
foreach ($file in $ideologicaFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "ideologica\$file") -Destination (Join-Path $outputDir 'ideologica')
}

Copy-Item -Path (Join-Path $projectRoot 'ideologica\css\*') -Destination (Join-Path $outputDir 'ideologica\css') -Recurse
Copy-Item -Path (Join-Path $projectRoot 'ideologica\js\*') -Destination (Join-Path $outputDir 'ideologica\js') -Recurse

$headers = @'
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/*.html
  Cache-Control: no-cache, no-store, must-revalidate

/auth.js
  Cache-Control: no-cache, no-store, must-revalidate

/*.png
  Cache-Control: public, max-age=86400
'@

Set-Content -LiteralPath (Join-Path $outputDir '_headers') -Value $headers -Encoding utf8
Set-Content -LiteralPath (Join-Path $outputDir '.nojekyll') -Value '' -Encoding ascii

$notFound = @'
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Pagina nao encontrada</title>
</head>
<body>
  <main>
    <h1>Pagina nao encontrada</h1>
    <p><a href="/">Voltar ao inicio</a></p>
  </main>
</body>
</html>
'@
Set-Content -LiteralPath (Join-Path $outputDir '404.html') -Value $notFound -Encoding utf8

$publishedFiles = Get-ChildItem -LiteralPath $outputDir -File -Recurse
$forbidden = @(
    $publishedFiles | Where-Object {
        $_.Extension -in @('.sql', '.ps1', '.md') -or
        $_.FullName -match '[\\/](\.git|backups|import|supabase|sync)[\\/]'
    }
)

if ($forbidden.Count -gt 0) {
    $names = ($forbidden.FullName -join [Environment]::NewLine)
    throw "Arquivos internos encontrados no pacote de producao:$([Environment]::NewLine)$names"
}

Write-Host "Build Cloudflare concluido: $($publishedFiles.Count) arquivos em $outputDir"
