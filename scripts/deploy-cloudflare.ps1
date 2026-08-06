$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'build-cloudflare.ps1')

Push-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
try {
    npx wrangler pages deploy .\dist-cloudflare `
        --project-name gruporestaura `
        --branch main `
        --commit-dirty=true
    if ($LASTEXITCODE -ne 0) {
        throw 'O Cloudflare recusou o deploy.'
    }
}
finally {
    Pop-Location
}
