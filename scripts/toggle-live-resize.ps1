# 关闭 / 恢复 Windows 的「拖动时显示窗口内容」（DragFullWindows）。
#
# 关掉之后，拖动窗口边框时系统只画一个虚线框，松手才真正改大小——
# 窗口不会出现「中间尺寸」，也就不会露出那块填充色。
#
# 这是**全系统**设置（资源管理器、所有应用都受影响），不是只针对 DSH。
#
#   powershell -ExecutionPolicy Bypass -File scripts\toggle-live-resize.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File scripts\toggle-live-resize.ps1 -Off
#   powershell -ExecutionPolicy Bypass -File scripts\toggle-live-resize.ps1 -On
param(
    [switch]$Off,
    [switch]$On,
    [switch]$Status
)

$key = 'HKCU:\Control Panel\Desktop'
$name = 'DragFullWindows'
$current = (Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue).$name

function Show-Status {
    if ($current -eq '1') { $state = '开启（拖动时实时显示内容）' }
    elseif ($current -eq '0') { $state = '关闭（拖动时只显示虚线框）' }
    else { $state = "未知（$current）" }
    Write-Output "DragFullWindows = $current  ->  $state"
}

if ($Status -or (-not $Off -and -not $On)) {
    Show-Status
    exit 0
}

if ($Off) { $target = '0' } else { $target = '1' }
Set-ItemProperty -Path $key -Name $name -Value $target -Type String
Show-Status
Write-Output ''
Write-Output '已写入注册表。如果没立刻生效，注销重登一次，或重启资源管理器。'
if ($Off) {
    Write-Output '注意：这是全系统设置，所有应用的拖动都会变成虚线框。恢复用 -On。'
}