# 실서버 배포: Worker(API) + Pages(웹)
#   .\deploy.ps1          둘 다
#   .\deploy.ps1 worker   Worker만
#   .\deploy.ps1 web      웹만
param([ValidateSet('all', 'worker', 'web')][string]$Target = 'all')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Invoke-Step([string]$dir, [scriptblock]$block) {
    Push-Location (Join-Path $root $dir)
    try {
        & $block
        if ($LASTEXITCODE -ne 0) { throw "$dir 배포 실패 (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

if ($Target -in 'all', 'worker') {
    Write-Host "`n== Worker 배포 ==" -ForegroundColor Cyan
    Invoke-Step 'worker' { npx wrangler deploy }
    # 새 DB 변경(마이그레이션)이 있으면 실서버 D1에 적용 (없으면 아무것도 안 함)
    # 코드를 먼저 올려 두면 컬럼 삭제류 변경도 안전함
    Invoke-Step 'worker' { npx wrangler d1 migrations apply dfloader --remote }
}

if ($Target -in 'all', 'web') {
    Write-Host "`n== 웹 빌드 ==" -ForegroundColor Cyan
    Invoke-Step 'web' {
        $env:VITE_API_URL = 'https://dfloader-api.dfloader-api.workers.dev'
        npm run build
    }
    Write-Host "`n== Pages 배포 ==" -ForegroundColor Cyan
    Invoke-Step 'web' {
        npx wrangler pages deploy dist --project-name df-raid-sheet --branch main --commit-dirty=true
    }
}

Write-Host "`n완료: https://df-raid-sheet.pages.dev" -ForegroundColor Green
