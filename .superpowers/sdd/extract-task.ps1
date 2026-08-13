param(
  [Parameter(Mandatory=$true)][string]$Plan,
  [Parameter(Mandatory=$true)][int]$Task,
  [string]$Out
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Plan)) { throw "no such plan file: $Plan" }
$root = & git rev-parse --show-toplevel
$dir = Join-Path $root ".superpowers\sdd"
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (-not $Out) { $Out = Join-Path $dir "task-$Task-brief.md" }

function Extract-TaskSection([string]$path, [int]$n) {
  $all = [System.IO.File]::ReadAllLines($path)
  $inFence = $false
  $inTask = $false
  $collect = New-Object System.Collections.Generic.List[string]
  $taskHeader = "^##\s+Task\s+$n([^0-9]|$)"
  $anyTask = "^##\s+Task\s+[0-9]+"
  foreach ($line in $all) {
    if ($line -match '^```') { $inFence = -not $inFence }
    if (-not $inFence -and ($line -match $anyTask)) {
      if ($inTask) { break }
      if ($line -match $taskHeader) { $inTask = $true }
    }
    if ($inTask) { [void]$collect.Add($line) }
  }
  return $collect
}
$section = Extract-TaskSection -path $Plan -n $Task
if ($section.Count -eq 0) { throw "task $Task not found in $Plan" }
[System.IO.File]::WriteAllLines($Out, $section)
$count = $section.Count
Write-Output "wrote $Out : $count lines"
