param(
  [Parameter(Mandatory = $true)][string]$Base,
  [Parameter(Mandatory = $true)][string]$Head
)
git rev-parse --verify --quiet $Base *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "bad BASE: $Base"; exit 2 }
git rev-parse --verify --quiet $Head *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "bad HEAD: $Head"; exit 2 }
$dir = ".superpowers/sdd"
$base7 = (git rev-parse --short $Base | Out-String).Trim()
$head7 = (git rev-parse --short $Head | Out-String).Trim()
$out = Join-Path $dir "review-$base7..$head7.diff"
"=== COMMITS ($base7..$head7) ===" | Set-Content -Encoding UTF8 $out
git log --oneline "$Base..$Head" | Add-Content $out
"" | Add-Content $out
"=== STAT ===" | Add-Content $out
git diff --stat "$Base..$Head" | Add-Content $out
"" | Add-Content $out
"=== DIFF (-U10) ===" | Add-Content $out
git diff -U10 "$Base..$Head" | Add-Content $out
Write-Output $out
