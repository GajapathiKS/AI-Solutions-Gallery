# Script to run needs assessment tests for all students

Write-Host "Building project..." -ForegroundColor Cyan
npm run build

Write-Host "`nFetching student IDs from API..." -ForegroundColor Cyan
$students = curl.exe -k https://localhost:7140/api/students | ConvertFrom-Json

$stu700 = $students | Where-Object { $_.localId -eq "STU700" }
$stu701 = $students | Where-Object { $_.localId -eq "STU701" }
$stu702 = $students | Where-Object { $_.localId -eq "STU702" }

if (-not $stu702) {
    Write-Host "STU702 not found! Creating student first..." -ForegroundColor Yellow
    node dist/cli-dom.js src/tests/add_student_dom_test3.txt --env dev --url http://localhost:4200/students/new
    Start-Sleep -Seconds 2
    $students = curl.exe -k https://localhost:7140/api/students | ConvertFrom-Json
    $stu702 = $students | Where-Object { $_.localId -eq "STU702" }
}

Write-Host "`nStudent IDs found:" -ForegroundColor Green
Write-Host "STU700: $($stu700.id)"
Write-Host "STU701: $($stu701.id)"  
Write-Host "STU702: $($stu702.id)"

Write-Host "`nRunning needs assessment tests..." -ForegroundColor Cyan

if ($stu702) {
    Write-Host "`n=== Testing STU702 Needs Assessment ===" -ForegroundColor Magenta
    $url702 = "http://localhost:4200/students/$($stu702.id)/needs/new"
    Write-Host "URL: $url702"
    node dist/cli-dom.js src/tests/create_needs_assessment_stu702.txt --env dev --url $url702
}

if ($stu701) {
    Write-Host "`n=== Testing STU701 Needs Assessment ===" -ForegroundColor Magenta
    $url701 = "http://localhost:4200/students/$($stu701.id)/needs/new"
    Write-Host "URL: $url701"
    node dist/cli-dom.js src/tests/create_needs_assessment_stu701.txt --env dev --url $url701
}

if ($stu700) {
    Write-Host "`n=== Testing STU700 Needs Assessment ===" -ForegroundColor Magenta
    $url700 = "http://localhost:4200/students/$($stu700.id)/needs/new"
    Write-Host "URL: $url700"
    node dist/cli-dom.js src/tests/create_needs_assessment_stu700.txt --env dev --url $url700
}

Write-Host "`nAll tests completed!" -ForegroundColor Green
