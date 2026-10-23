param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'Lecture Lab Public.lnk'
$disabledPath = Join-Path $appDir '.public-autostart-disabled'
if ($Remove) {
    Set-Content -LiteralPath $disabledPath -Value 'disabled' -Encoding ascii
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output 'Public startup disabled. The running host stays on; use stop_public.bat to stop it.'
    exit
}
$pythonw = Join-Path $appDir 'runtime/pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonw)) { throw 'A portable runtime containing pythonw.exe is required.' }
$gitExe = (Get-Command git -ErrorAction Stop).Source
$settingsPath = Join-Path $appDir '.public-publish.json'
@{enabled=$true; repository='lsb2194221469-crypto/AILT9019-Group-Project'; branch='main'; git=$gitExe} | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8
if (Test-Path -LiteralPath $disabledPath) { Remove-Item -LiteralPath $disabledPath }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = '"' + (Join-Path $appDir 'maintain_public.py') + '"'
$shortcut.WorkingDirectory = $appDir
$shortcut.Description = 'Run Lecture Lab public service and update its GitHub entry after Windows sign-in.'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output 'Installed current-user login startup. No password or token was copied.'
