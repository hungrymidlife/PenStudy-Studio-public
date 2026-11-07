# Development-only adjustment: WS on trusted private LAN / ADB reverse uses cleartext traffic.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repo 'apps\android\src-tauri\gen\android\app\src\main\AndroidManifest.xml'
if (-not (Test-Path -LiteralPath $manifest)) {
    Write-Host "AndroidManifest.xml not found. Run INIT_ANDROID.bat first." -ForegroundColor Yellow
    exit 1
}
$text = [IO.File]::ReadAllText($manifest, [Text.UTF8Encoding]::new($false))
if ($text -notmatch 'android\.permission\.INTERNET') {
    $text = [regex]::Replace($text, '<application\b', '<uses-permission android:name="android.permission.INTERNET" />' + "`r`n" + '    <application', 1)
}
if ($text -notmatch 'android.permission.CAMERA') {
    $text = [regex]::Replace($text, '<application\b', '<uses-permission android:name="android.permission.CAMERA" />' + "`r`n" + '    <application', 1)
}
if ($text -notmatch 'android:usesCleartextTraffic\s*=') {
    $text = [regex]::Replace($text, '<application\b', '<application android:usesCleartextTraffic="true"', 1)
} else {
    $text = [regex]::Replace($text, 'android:usesCleartextTraffic\s*=\s*"[^"]*"', 'android:usesCleartextTraffic="true"')
}
# Orientation must follow the physical Galaxy S Pen display.
# Without this, holding a portrait-locked WebView sideways maps "left" to PC "top".
$activity = [regex]::Match($text, '(?s)<activity\b(?=[^>]*android:name\s*=\s*"[^"]*MainActivity")[^>]*>')
if (-not $activity.Success) {
    throw 'Could not find Android MainActivity in generated manifest; orientation was not patched.'
}
$activityTag = $activity.Value
if ($activityTag -match 'android:screenOrientation\s*=') {
    $updatedTag = [regex]::Replace($activityTag, 'android:screenOrientation\s*=\s*"[^"]*"', 'android:screenOrientation="fullSensor"')
} else {
    $updatedTag = $activityTag.Substring(0, $activityTag.Length - 1) + ' android:screenOrientation="fullSensor">'
}
$text = $text.Remove($activity.Index, $activity.Length).Insert($activity.Index, $updatedTag)
Write-Host 'Applied fullSensor orientation to Android MainActivity.' -ForegroundColor Green
[IO.File]::WriteAllText($manifest, $text, [Text.UTF8Encoding]::new($false))
Write-Host 'Applied Internet permission and cleartext LAN WS setting:' $manifest -ForegroundColor Green
Write-Host 'WARNING: Only use this app on trusted private Wi-Fi or ADB reverse. No TLS is enabled.' -ForegroundColor Yellow
