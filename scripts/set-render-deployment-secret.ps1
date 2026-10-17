# Operator-only masked input. Stores the Render API token encrypted for this Windows user.
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
[void][Reflection.Assembly]::LoadWithPartialName('System.Security')
$secretTarget = Join-Path $PSScriptRoot '..\secrets\render-api.dpapi'
if (Test-Path -LiteralPath $secretTarget) { throw 'Render credential store already exists; refusing to overwrite.' }
$tokenSecure = Read-Host 'Paste your Render API key (hidden; do not paste it in chat)' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
try {
    $tokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($tokenText)) { throw 'No API key supplied.' }
    $protectedToken = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($tokenText), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllText($secretTarget, [Convert]::ToBase64String($protectedToken))
    $accountName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $secretTarget /inheritance:r /grant:r "${accountName}:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict secret-file permissions.' }
    Write-Host 'Render deployment credential saved securely. No key value was printed.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $tokenText = $null
    $tokenSecure.Dispose()
}
