# Smoke test on a Windows runner (no microphone): output shape, ConsentStore reading through fake entries under
# HKCU, running programs, and a window title. Usage: pwsh smoke/windows.ps1 path\to\yogurt-system.exe
param([string]$Bin)
$ErrorActionPreference = 'Stop'
$Bin = (Resolve-Path $Bin).Path
function Check($what, [scriptblock]$ok, $raw) {
  $v = $raw | ConvertFrom-Json -NoEnumerate
  if (-not (& $ok $v)) { throw "failed: $what`n$raw" }
  Write-Host "ok: $what"
}

$raw = & $Bin mic-apps
Check 'mic-apps is a JSON list' { param($v) $v -is [array] } $raw

# fake privacy entries: in use by this shell, in use by a program not running (a crash), ended, and a Store app
$store = 'Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
$hk = [Microsoft.Win32.Registry]::CurrentUser
$qword = [Microsoft.Win32.RegistryValueKind]::QWord
function Entry($path, [long]$start, [long]$stop) {
  $k = $hk.CreateSubKey("$store\$path")
  $k.SetValue('LastUsedTimeStart', $start, $qword)
  $k.SetValue('LastUsedTimeStop', $stop, $qword)
  $k.Close()
}
$shell = (Get-Process -Id $PID).Path -replace '\\', '#'
Entry "NonPackaged\$shell" 133700000000000000 0
Entry 'NonPackaged\C:#Fake#notrunninghere.exe' 133700000000000000 0
Entry 'NonPackaged\C:#Windows#System32#svchost.exe' 133700000000000000 133700000100000000
Entry 'Fake.Package_abcd1234efgh' 133700000000000000 0
$me = (Split-Path (Get-Process -Id $PID).Path -Leaf).ToLower()

$raw = & $Bin mic-apps
Write-Host "mic-apps: $raw"
Check "an app in use is listed as $me" { param($v) @($v | Where-Object { $_.bundleId -eq $me -and $_.pid -gt 0 -and $_.name }).Count -eq 1 } $raw
Check 'an app that is not running is not' { param($v) -not ($v | Where-Object { $_.bundleId -eq 'notrunninghere.exe' }) } $raw
Check 'an ended entry is not' { param($v) -not ($v | Where-Object { $_.bundleId -eq 'svchost.exe' }) } $raw
Check 'keys like the Mac helper' { param($v) @($v | Where-Object { (($_.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'bundleId,name,pid' }).Count -eq 0 } $raw

Check 'running apps in the order asked' { param($v) ($v -join ',') -eq "$me,svchost.exe" } (& $Bin running-apps $me notrunninghere.exe SVCHOST.EXE | ForEach-Object { $_.ToLower() })

# a window with a known title in another process
$title = 'Meet - abc-defg-hij'
$form = "Add-Type -AssemblyName System.Windows.Forms; `$f = New-Object System.Windows.Forms.Form; `$f.Text = '$title'; [System.Windows.Forms.Application]::Run(`$f)"
$p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $form -PassThru
try {
  # a cold runner can take a while to load Windows Forms
  for ($i = 0; $i -lt 60; $i++) {
    $raw = & $Bin browser-title powershell.exe
    if (($raw | ConvertFrom-Json).title) { break }
    Start-Sleep -Milliseconds 500
  }
  Check 'the window title' { param($v) $v.title -eq $title } $raw
} finally { Stop-Process -Id $p.Id -Force }
Check 'no window for an app that is not open' { param($v) $null -eq $v.title } (& $Bin browser-title notrunninghere.exe)

# call-watch: a window shaped like a Meet call (its title has the word Meet) with a person's name in it, read through
# UI Automation; the watch ends when its stdin closes
$form = "Add-Type -AssemblyName System.Windows.Forms; `$f = New-Object System.Windows.Forms.Form; `$f.Text = '$title'; `$l = New-Object System.Windows.Forms.Label; `$l.Text = 'Ana Ruiz'; `$f.Controls.Add(`$l); [System.Windows.Forms.Application]::Run(`$f)"
$p = Start-Process powershell.exe -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $form -PassThru
try {
  $psi = New-Object System.Diagnostics.ProcessStartInfo $Bin
  $psi.Arguments = 'call-watch 400 notrunninghere.exe powershell.exe'
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardInput = $true
  $w = [System.Diagnostics.Process]::Start($psi)
  $raw = $null
  for ($i = 0; $i -lt 60 -and -not $raw; $i++) {
    $line = $w.StandardOutput.ReadLine()
    if ($line -match '"app":"powershell.exe"' -and $line -match 'Ana Ruiz') { $raw = $line }
  }
  if (-not $raw) { throw "failed: call-watch never read the window; last line: $line" }
  Write-Host "call-watch: $($raw.Substring(0, [Math]::Min(600, $raw.Length)))"
  function Find($n, $role, $text) {
    if ($n.r -eq $role -and $n.t -eq $text) { return $true }
    foreach ($k in @($n.k)) { if ($k -and (Find $k $role $text)) { return $true } }
    return $false
  }
  Check 'call-watch reads the call window' { param($v) $v.app -eq 'powershell.exe' -and $v.windows[0].title -eq $title -and $v.t -gt 0 } $raw
  Check 'the name is a label, as AT-SPI calls it' { param($v) Find $v.windows[0].tree 'label' 'Ana Ruiz' } $raw
  $w.StandardInput.Close()
  if (-not $w.WaitForExit(5000)) { $w.Kill(); throw 'failed: call-watch did not end when its stdin closed' }
  Write-Host 'ok: call-watch ends when its stdin closes'
} finally { Stop-Process -Id $p.Id -Force }
$raw = & $Bin call-watch 2>$null
if ($LASTEXITCODE -eq 0) { throw 'call-watch with no ids should fail' }

& $Bin browser-title 2>$null
if ($LASTEXITCODE -eq 0) { throw 'browser-title with no id should fail' }
Write-Host 'all Windows smoke checks passed'
exit 0
