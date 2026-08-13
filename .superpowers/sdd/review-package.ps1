param(
  [Parameter(Mandatory=$true)][string]$Base,
  [Parameter(Mandatory=$true)][string]$Head,
  [string]$Out
)
$ErrorActionPreference = 'Stop'
& git rev-parse --verify --quiet $Base *> $null; if ($LASTEXITCODE -ne 0) { throw "bad BASE: $Base" }
& git rev-parse --verify --quiet $Head *> $null; if ($LASTEXITCODE -ne 0) { throw "bad HEAD: $Head" }
$root = & git rev-parse --show-toplevel
$dir = Join-Path $root ".superpowers\sdd"
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (-not $Out) {
  $b = & git rev-parse --short $Base
  $h = & git rev-parse --short $Head
  $Out = Join-Path $dir "review-$b..$h.diff"
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Review package: $Base..$Head")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Commits")
$commits = & git log --oneline "$Base..$Head"
foreach ($c in $commits) { [void]$sb.AppendLine($c) }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Files changed")
$stat = & git diff --stat "$Base..$Head"
foreach ($s in $stat) { [void]$sb.AppendLine($s) }
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Diff")
$diff = & git diff -U10 "$Base..$Head"
foreach ($d in $diff) { [void]$sb.AppendLine($d) }
[System.IO.File]::WriteAllText($Out, $sb.ToString())

$count = (& git rev-list --count "$Base..$Head")
$size = (Get-Item -LiteralPath $Out).Length
Write-Output "wrote $Out : $count commit(s), $size bytes"
Write-Output $Out
