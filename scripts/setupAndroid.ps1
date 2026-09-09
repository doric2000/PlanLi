param([switch]$Install)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $repoRoot '.codex_tmp\android'
$sdkRoot = Join-Path $toolRoot 'sdk'
$maestroRoot = Join-Path $toolRoot 'maestro'
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'user'
$env:ANDROID_AVD_HOME = Join-Path $toolRoot 'avd'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.9.10-hotspot'
$env:PATH = "$env:JAVA_HOME\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;$env:PATH"

function Get-VerifiedArchive($Url, $Destination, $Hash, $Algorithm) {
    if (!(Test-Path -LiteralPath $Destination)) {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm $Algorithm).Hash.ToLowerInvariant() -ne $Hash) {
        throw "Downloaded package integrity check failed: $Destination"
    }
}

if ($Install) {
    New-Item -ItemType Directory -Force -Path $toolRoot,$sdkRoot,$maestroRoot,$env:ANDROID_AVD_HOME | Out-Null
    # Revision 19 uses the Java SDK manager; revision 23's new Windows launcher fails silently here.
    $cliArchive = Join-Path $toolRoot 'commandlinetools-13114758.zip'
    Get-VerifiedArchive 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' $cliArchive '98b565cb657b012dae6794cefc0f66ae1efb4690c699b78a614b4a6a3505b003' 'SHA256'
    $cliRoot = Join-Path $sdkRoot 'cmdline-tools\19.0'
    if (!(Test-Path -LiteralPath "$cliRoot\bin\sdkmanager.bat")) {
        $unpackRoot = Join-Path $toolRoot 'commandlinetools-13114758'
        if (!(Test-Path -LiteralPath "$unpackRoot\cmdline-tools\bin\sdkmanager.bat")) {
            Expand-Archive -LiteralPath $cliArchive -DestinationPath $unpackRoot
        }
        New-Item -ItemType Directory -Force -Path $cliRoot | Out-Null
        foreach ($entry in @('bin', 'lib', 'source.properties', 'NOTICE.txt')) {
            Copy-Item -LiteralPath "$unpackRoot\cmdline-tools\$entry" -Destination $cliRoot -Recurse
        }
    }
    $maestroArchive = Join-Path $toolRoot 'maestro-2.10.0.zip'
    Get-VerifiedArchive 'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.10.0/maestro.zip' $maestroArchive '29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991' 'SHA256'
    if (!(Test-Path -LiteralPath "$maestroRoot\maestro\bin\maestro.bat")) {
        Expand-Archive -LiteralPath $maestroArchive -DestinationPath $maestroRoot
    }
    1..100 | ForEach-Object { 'y' } | & "$cliRoot\bin\sdkmanager.bat" "--sdk_root=$sdkRoot" --licenses
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK license setup failed.' }
    & "$cliRoot\bin\sdkmanager.bat" "--sdk_root=$sdkRoot" 'platform-tools' 'emulator' 'platforms;android-36' 'build-tools;36.0.0' 'system-images;android-34;google_apis;x86_64'
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
    if (!(Test-Path -LiteralPath "$env:ANDROID_AVD_HOME\PlanLi_E2E_API34.ini")) {
        'no' | & "$cliRoot\bin\avdmanager.bat" create avd --name PlanLi_E2E_API34 --package 'system-images;android-34;google_apis;x86_64' --device pixel_6
        if ($LASTEXITCODE -ne 0) { throw 'Android virtual device creation failed.' }
    }
    $avdConfigPath = Join-Path $env:ANDROID_AVD_HOME 'PlanLi_E2E_API34.avd\config.ini'
    $avdConfig = Get-Content -LiteralPath $avdConfigPath -Raw
    $deviceSettings = @{ 'hw.gpu.enabled'='yes'; 'hw.gpu.mode'='software'; 'hw.lcd.width'='720'; 'hw.lcd.height'='1280'; 'hw.lcd.density'='280'; 'hw.cpu.ncore'='2'; 'hw.ramSize'='1536' }
    foreach ($key in $deviceSettings.Keys) {
        $pattern = '(?m)^' + [regex]::Escape($key) + '=.*$'
        $entry = $key + '=' + $deviceSettings[$key]
        if ($avdConfig -match $pattern) { $avdConfig = [regex]::Replace($avdConfig, $pattern, $entry) }
        else { $avdConfig += "`n$entry" }
    }
    Set-Content -LiteralPath $avdConfigPath -Value $avdConfig -NoNewline -Encoding Ascii
}

foreach ($tool in @("$sdkRoot\platform-tools\adb.exe", "$sdkRoot\emulator\emulator.exe", "$maestroRoot\maestro\bin\maestro.bat")) {
    if (!(Test-Path -LiteralPath $tool)) { throw "Local Android tool is missing: $tool. Run npm run setup:android -- -Install once." }
}
& "$sdkRoot\emulator\emulator.exe" -accel-check
if ($LASTEXITCODE -ne 0) { throw 'Android hardware acceleration is unavailable. Enable firmware virtualization and Windows Hypervisor Platform, then restart Windows.' }
Write-Output 'Local Android tools are ready. Use npm run test:android to run the selected flows.'
