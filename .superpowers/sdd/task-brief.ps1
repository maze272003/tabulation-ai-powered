param(
  [Parameter(Mandatory = $true)][string]$PlanPath,
  [Parameter(Mandatory = $true)][int]$N
)
$lines = Get-Content $PlanPath
$inFence = $false
$capturing = $false
$taskPattern = "^#+\s+Task\s+$N([^0-9]|$)"
$anyTask = "^#+\s+Task\s+\d+"
$col = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
  if ($line -match '^```') { $inFence = -not $inFence }
  if (-not $inFence -and $line -match $anyTask) {
    if ($line -match $taskPattern) {
      $capturing = $true
      $col.Add($line)
      continue
    } elseif ($capturing) { break }
  }
  if ($capturing) { $col.Add($line) }
}
$dir = ".superpowers/sdd"
$out = Join-Path $dir "task-$N-brief.md"
$col | Set-Content -Encoding UTF8 $out
Write-Output $out
