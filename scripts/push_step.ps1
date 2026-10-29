# PowerShell wrapper for step_pusher.js
param(
    [switch]$Auto,
    [double]$Delay = 30
)

$argsList = @()
if ($Auto) {
    $argsList += "--auto"
    $argsList += "--delay"
    $argsList += $Delay
}

node "$PSScriptRoot/step_pusher.js" $argsList
