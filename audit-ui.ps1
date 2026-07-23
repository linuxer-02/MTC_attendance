$uiFolder = "src\components\ui"
$searchFolders = @("src\routes", "src\features")

$uiComponents = Get-ChildItem -Path $uiFolder -Name -Filter "*.tsx" | ForEach-Object { $_ -replace "\.tsx$", "" }
$appContent = ($searchFolders | ForEach-Object { Get-ChildItem -Path $_ -Recurse -Include "*.tsx","*.ts" | Get-Content -Raw -ErrorAction SilentlyContinue }) -join "`n"

foreach ($comp in $uiComponents) {
    if ($appContent -match [regex]::Escape("ui/$comp")) {
        Write-Host "USED:   $comp"
    } else {
        Write-Host "UNUSED: $comp"
    }
}
