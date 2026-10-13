param([string]$CoveSourceRoot = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $root 'src/NudityLevel/extension.json') -Raw | ConvertFrom-Json
$artifacts = Join-Path $root 'artifacts'
$stage = Join-Path $artifacts ([Guid]::NewGuid().ToString('N'))
$arguments = @('publish', (Join-Path $root 'src/NudityLevel/NudityLevel.csproj'), '-c', 'Release', '-o', $stage, '-p:CoveCiVersion=true', '--nologo')
if ($CoveSourceRoot) { $arguments += "-p:CoveSourceRoot=$CoveSourceRoot" }
& dotnet @arguments
if ($LASTEXITCODE -ne 0) { throw 'Extension publish failed.' }
$allowed = @('Cove.NudityLevel.dll', 'Cove.NudityLevel.deps.json', 'Cove.NudityLevel.runtimeconfig.json', 'extension.json', 'assets')
foreach ($name in $allowed) { if (!(Test-Path -LiteralPath (Join-Path $stage $name))) { throw "Missing package file: $name" } }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $artifacts "$($manifest.id)-$($manifest.version).zip"
$stream = [IO.MemoryStream]::new()
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
try {
    foreach ($name in $allowed) {
        foreach ($file in Get-ChildItem -LiteralPath (Join-Path $stage $name) -File -Recurse) {
            $entry = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
} finally { $archive.Dispose() }
try { [IO.File]::WriteAllBytes($zip, $stream.ToArray()) } finally { $stream.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($zip)
try {
    if ($check.Entries.Count -lt 9 -or $check.Entries.FullName -contains 'Cove.Data.dll' -or $check.Entries.FullName -contains 'Cove.Sdk.dll') { throw 'Invalid package contents.' }
    foreach ($required in @('assets/index.mjs', 'assets/settings.mjs', 'assets/filters.mjs', 'assets/model.mjs', 'assets/drag.mjs', 'assets/nudity-level.css', 'extension.json', 'Cove.NudityLevel.dll')) {
        if ($check.Entries.FullName -notcontains $required) { throw "ZIP is missing $required" }
    }
} finally { $check.Dispose() }
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$zip.sha256", "$hash  $([IO.Path]::GetFileName($zip))`n")
Write-Output "Package: $zip"
Write-Output "SHA256: $hash"
