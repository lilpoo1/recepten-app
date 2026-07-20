param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dry-run", "restore", "validate")]
    [string]$Mode,
    [Parameter(Mandatory = $true)]
    [string]$SourceUri,
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^recovery-[a-z0-9-]+$")]
    [string]$RecoveryDatabase,
    [string]$ProjectId = "recepten-app-87beb",
    [string]$Location = "nam5"
)

$ErrorActionPreference = "Stop"
$gcloud = if ($env:GCLOUD_BIN) { $env:GCLOUD_BIN } else { "gcloud" }

if ($RecoveryDatabase -eq "(default)") {
    throw "Herstel naar de productiedatabase is niet toegestaan."
}

if ($Mode -eq "dry-run") {
    & $gcloud storage ls "$SourceUri/**"
    & $gcloud firestore databases describe `
        --database="(default)" `
        --project=$ProjectId `
        --format="value(name,locationId)"
    Write-Output "Dry-run voltooid. Doel: $RecoveryDatabase; bron: $SourceUri"
    exit 0
}

if ($Mode -eq "restore") {
    $existing = & $gcloud firestore databases describe `
        --database=$RecoveryDatabase `
        --project=$ProjectId `
        --format="value(name)" 2>$null
    if (-not $existing) {
        & $gcloud firestore databases create `
            --database=$RecoveryDatabase `
            --location=$Location `
            --type=firestore-native `
            --project=$ProjectId `
            --quiet
    }
    & $gcloud firestore import $SourceUri `
        --database=$RecoveryDatabase `
        --project=$ProjectId
    exit $LASTEXITCODE
}

$env:GCLOUD_BIN = $gcloud
& node scripts/verify-firestore-restore.mjs `
    "--project=$ProjectId" `
    "--source=(default)" `
    "--restored=$RecoveryDatabase"
exit $LASTEXITCODE
