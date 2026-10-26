$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildCommit = (git -C $repo rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $buildCommit) { throw 'Could not resolve the build commit.' }
Write-Output "Build commit: $buildCommit"
$statusLines = @(git -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the working tree.' }
$trackedChanges = @($statusLines | Where-Object { $_ -notmatch '^\?\?' })
if ($trackedChanges.Count -gt 0) { throw 'Tracked changes are present. Commit or discard them before packaging.' }

$tauriConfigPath = Join-Path $repo 'desktop/src-tauri/tauri.conf.json'
$cargoManifestPath = Join-Path $repo 'desktop/src-tauri/Cargo.toml'
$cargoLockPath = Join-Path $repo 'desktop/src-tauri/Cargo.lock'
$packageManifestPath = Join-Path $repo 'package.json'
$tauriVersion = (Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json).version
$cargoManifest = Get-Content -LiteralPath $cargoManifestPath -Raw
$cargoMatch = [regex]::Match($cargoManifest, '(?m)^version\s*=\s*"([^"]+)"')
$cargoLock = Get-Content -LiteralPath $cargoLockPath -Raw
$cargoLockMatch = [regex]::Match($cargoLock, '(?ms)^\[\[package\]\]\s*\nname = "agent-office-desktop"\s*\nversion = "([^"]+)"')
$packageVersion = (Get-Content -LiteralPath $packageManifestPath -Raw | ConvertFrom-Json).version
if (-not $cargoMatch.Success) { throw 'Cargo.toml package version was not found.' }
if (-not $cargoLockMatch.Success) { throw 'Cargo.lock package version was not found.' }
$cargoVersion = $cargoMatch.Groups[1].Value
$cargoLockVersion = $cargoLockMatch.Groups[1].Value
$versions = @($tauriVersion, $cargoVersion, $cargoLockVersion, $packageVersion) | Sort-Object -Unique
if ($versions.Count -ne 1) {
  throw "Version mismatch: tauri.conf.json=$tauriVersion, Cargo.toml=$cargoVersion, Cargo.lock=$cargoLockVersion, package.json=$packageVersion."
}

node (Join-Path $PSScriptRoot 'smoke-pages.mjs')
if ($LASTEXITCODE -ne 0) { throw '페이지 스모크 검증 실패. 패키징을 중단합니다.' }
node (Join-Path $PSScriptRoot 'check-scene.mjs')
if ($LASTEXITCODE -ne 0) { throw '장면 회귀 검증 실패. 패키징을 중단합니다.' }
$output = Join-Path $repo '.package-win'
$nodeDir = Join-Path $output 'node'
$portableDir = Join-Path $output 'portable'
$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$version = $tauriConfig.version
$null = New-Item -ItemType Directory -Force -Path $nodeDir

$index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
$nodeRelease = $index | Where-Object { $_.version -match '^v24\.' -and $_.files -contains 'win-x64-zip' } | Select-Object -First 1
if (-not $nodeRelease) { throw 'Node.js 24 win-x64 zip was not found on nodejs.org.' }
$nodeVersion = $nodeRelease.version
$archiveName = "node-$nodeVersion-win-x64.zip"
$archivePath = Join-Path $nodeDir $archiveName
$baseUrl = "https://nodejs.org/dist/$nodeVersion/"
if (-not (Test-Path $archivePath)) { Invoke-WebRequest -Uri ($baseUrl + $archiveName) -OutFile $archivePath }
$checksumPath = Join-Path $nodeDir 'SHASUMS256.txt'
Invoke-WebRequest -Uri ($baseUrl + 'SHASUMS256.txt') -OutFile $checksumPath
$checksums = Get-Content -LiteralPath $checksumPath -Raw
$expectedLine = $checksums -split "`n" | Where-Object { $_ -match "\s+$([regex]::Escape($archiveName))\s*$" } | Select-Object -First 1
if (-not $expectedLine) { throw "Node.js checksum entry for $archiveName was not found." }
$expectedHash = ($expectedLine.Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'Node.js zip SHA256 verification failed.' }
$extractDir = Join-Path $nodeDir 'extract'
if (Test-Path $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir -Force
$nodeExe = Get-ChildItem -LiteralPath $extractDir -Filter node.exe -Recurse | Select-Object -First 1
if (-not $nodeExe) { throw 'node.exe was missing from the verified Node.js archive.' }
Copy-Item -LiteralPath $nodeExe.FullName -Destination (Join-Path $output 'node.exe') -Force

$bundler = Get-Command cargo-tauri -ErrorAction SilentlyContinue
if (-not $bundler) { $bundler = Get-Command tauri -ErrorAction SilentlyContinue }
$setupOutputDir = Join-Path $repo 'desktop/src-tauri/target/release/bundle/nsis'
if (-not $bundler) {
  Write-Warning 'Tauri bundler is unavailable; only the portable zip will be created.'
  Push-Location (Join-Path $repo 'desktop/src-tauri')
  try { cargo build --release } finally { Pop-Location }
}
else {
  if (Test-Path -LiteralPath $setupOutputDir) {
    $oldSetupFiles = @(Get-ChildItem -LiteralPath $setupOutputDir -File -Filter '*-setup.exe')
    if ($oldSetupFiles.Count -gt 0) {
      $oldDir = Join-Path $setupOutputDir 'old'
      $null = New-Item -ItemType Directory -Force -Path $oldDir
      foreach ($oldSetup in $oldSetupFiles) {
        try {
          Remove-Item -LiteralPath $oldSetup.FullName -Force -ErrorAction Stop
        } catch {
          $destination = Join-Path $oldDir $oldSetup.Name
          if (Test-Path -LiteralPath $destination) {
            $suffix = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
            $destination = Join-Path $oldDir "$($oldSetup.BaseName)-$suffix$($oldSetup.Extension)"
          }
          Move-Item -LiteralPath $oldSetup.FullName -Destination $destination -Force -ErrorAction Stop
        }
      }
    }
  }
  $packageConfig = Join-Path $output 'tauri-package.json'
  @{
    bundle = @{
      resources = @{ '../../.package-win/node.exe' = 'node.exe' }
    }
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $packageConfig -Encoding utf8
  Push-Location (Join-Path $repo 'desktop/src-tauri')
  try { cargo tauri build --bundles nsis --config $packageConfig } finally { Pop-Location }
  $setupPattern = "*_${version}_x64-setup.exe"
  $setupMatches = @(Get-ChildItem -LiteralPath $setupOutputDir -File -Filter $setupPattern)
  if ($setupMatches.Count -ne 1) {
    throw "Expected exactly one installer matching '$setupPattern' in '$setupOutputDir'; found $($setupMatches.Count)."
  }
  $expectedPath = Join-Path $repo "AgentOffice_${version}_x64-setup.exe"
  $previousInstallerHashes = @(Get-ChildItem -LiteralPath $repo -File -Filter 'AgentOffice_*_x64-setup.exe' |
    Where-Object { $_.Name -ne [IO.Path]::GetFileName($expectedPath) } |
    ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() })
  Copy-Item -LiteralPath $setupMatches[0].FullName -Destination $expectedPath -Force
  $setupItem = Get-Item -LiteralPath $expectedPath
  $setupHash = (Get-FileHash -LiteralPath $expectedPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($previousInstallerHashes -contains $setupHash) {
    throw "Installer SHA256 matches a previous version artifact: $setupHash"
  }
  [PSCustomObject]@{ Name = $setupItem.Name; Length = $setupItem.Length; SHA256 = $setupHash } | Format-Table -AutoSize
}

if (Test-Path $portableDir) { Remove-Item -LiteralPath $portableDir -Recurse -Force }
$null = New-Item -ItemType Directory -Force -Path (Join-Path $portableDir 'resources/server')
Copy-Item -LiteralPath (Join-Path $repo 'desktop/src-tauri/target/release/agent-office-desktop.exe') -Destination (Join-Path $portableDir 'agent-office-desktop.exe')
Copy-Item -LiteralPath (Join-Path $output 'node.exe') -Destination (Join-Path $portableDir 'resources/node.exe')
Copy-Item -LiteralPath (Join-Path $repo 'server.js') -Destination (Join-Path $portableDir 'resources/server/server.js')
Copy-Item -LiteralPath (Join-Path $repo 'src') -Destination (Join-Path $portableDir 'resources/server/src') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'public') -Destination (Join-Path $portableDir 'resources/server/public') -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'config.example.json') -Destination (Join-Path $portableDir 'resources/server/config.example.json')
$zipPath = Join-Path $repo "AgentOffice_${version}_portable.zip"
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Get-Item -LiteralPath $zipPath | ForEach-Object {
  [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
} | Format-Table -AutoSize
if ($bundler) {
  Get-Item -LiteralPath (Join-Path $repo "AgentOffice_${version}_x64-setup.exe") | ForEach-Object {
    [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  } | Format-Table -AutoSize
}
Write-Output "Build commit: $buildCommit"
$finalStatus = @(git -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the final working tree.' }
$finalTrackedChanges = @($finalStatus | Where-Object { $_ -notmatch '^\?\?' })
if ($finalTrackedChanges.Count -gt 0) {
  Write-Warning 'Packaging changed tracked files:'
  $finalTrackedChanges | ForEach-Object { Write-Warning $_ }
}
