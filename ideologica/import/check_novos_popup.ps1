$ErrorActionPreference = "Continue"
# node escreve stdout em UTF-8, mas o pipeline do PowerShell 5.1 decodifica a
# saida de processos externos usando [Console]::OutputEncoding (o codepage do
# console, normalmente OEM/ANSI, nao UTF-8) — sem isso, acento e a seta "→" do
# import_all.js viram lixo (mojibake) no MessageBox.
$prevOutputEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    Set-Location "C:\laragon\www\presence-control"
    $output = & node "ideologica\import\import_all.js" "G:\Meu Drive\IDEOLÓGICA SISTEMA" --dry-run 2>&1 | Out-String
} catch {
    $output = ""
} finally {
    [Console]::OutputEncoding = $prevOutputEncoding
}

$count = 0
if ($output -match "Resumo:\s*(\d+)\s*novo") { $count = [int]$Matches[1] }

if ($count -gt 0) {
    Add-Type -AssemblyName System.Windows.Forms
    $novos = ($output -split "`r?`n" | Where-Object { $_ -match "^\[novo\]" }) -join "`n"
    $msg = "Ideologica: $count arquivo(s) novo(s) no Drive.`n`n$novos`n`nAbra o Claude Code pra importar."
    [System.Windows.Forms.MessageBox]::Show($msg, "Ideologica - Drive", "OK", "Information") | Out-Null
}
