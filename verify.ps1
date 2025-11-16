# MOSTLY AI GENERATED WITH SMALL TWEAKS
param(
    [string]$domain,
    [string]$web_server_name
)

if (-not $domain -or -not $web_server_name) {
    Write-Host "Usage: .\verify.ps1 <domain> <web_server_name>"
    exit 1
}

# Get all listening TCP ports
$open = Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort | Sort-Object | Get-Unique

if ($open.Count -eq 2 -and $open -contains 80 -and $open -contains 443) {
    Write-Host "PASS: only ports 80 and 443 are open"
} else {
    Write-Host "FAIL: expected only ports 80 and 443 to be open, found: $($open -join ', ')"
}

# Check HTTP 200 from /apps/$web_server_name
$url = "http://$domain/apps/$web_server_name"
try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: 200 received from $url"
        exit 0
    } else {
        Write-Host "FAIL: expected 200 from $url, got $($response.StatusCode)"
        exit 1
    }
} catch {
    Write-Host "FAIL: HTTP request to $url failed: $($_.Exception.Message)"
    exit 1
}