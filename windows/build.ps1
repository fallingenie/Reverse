param(
    [string]$Python = "python",
    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot "..")).Path
$venvRoot = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$distribution = Join-Path $projectRoot "dist\Reverse"

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit code: $LASTEXITCODE)"
    }
}

if (Test-Path -LiteralPath $distribution) {
    if (-not $ReplaceExisting) {
        throw "Existing distribution is not overwritten by default. Use -ReplaceExisting only for a verified failed build: $distribution"
    }
    $resolvedDistribution = (Resolve-Path -LiteralPath $distribution).Path
    if (-not $resolvedDistribution.StartsWith($projectRoot + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Distribution replacement target is outside the project boundary: $resolvedDistribution"
    }
}

if (-not (Test-Path -LiteralPath $venvPython)) {
    & $Python -m venv $venvRoot
    Assert-LastExitCode "Python virtual environment creation"
}

$previousPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = $projectRoot
try {
    & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $projectRoot "requirements.lock")
    Assert-LastExitCode "Python dependency installation"
    & $venvPython -m unittest discover -s (Join-Path $projectRoot "tests") -v
    Assert-LastExitCode "Python unit tests"
    $pyInstallerArguments = @(
        "-m", "PyInstaller",
        "--distpath", (Join-Path $projectRoot "dist"),
        "--workpath", (Join-Path $projectRoot "build")
    )
    if ($ReplaceExisting) {
        $pyInstallerArguments += @("--clean", "--noconfirm")
    }
    $pyInstallerArguments += (Join-Path $projectRoot "Reverse.spec")
    & $venvPython @pyInstallerArguments
    Assert-LastExitCode "PyInstaller build"
} finally {
    $env:PYTHONPATH = $previousPythonPath
}

Copy-Item -LiteralPath (Join-Path $repositoryRoot "LICENSE") -Destination (Join-Path $distribution "LICENSE")
Copy-Item -LiteralPath (Join-Path $repositoryRoot "NOTICE") -Destination (Join-Path $distribution "NOTICE")
Copy-Item -LiteralPath (Join-Path $projectRoot "README.md") -Destination (Join-Path $distribution "README.md")

& $venvPython (Join-Path $projectRoot "scripts\smoke_built.py") (Join-Path $distribution "Reverse.exe")
Assert-LastExitCode "Built Reverse.exe end-to-end smoke test"
& $venvPython (Join-Path $projectRoot "scripts\seal_build.py") $distribution
Assert-LastExitCode "Windows build seal"
& $venvPython (Join-Path $projectRoot "scripts\seal_build.py") $distribution --verify
Assert-LastExitCode "Windows build seal verification"
Write-Output "Windows onedir build complete: $distribution"
