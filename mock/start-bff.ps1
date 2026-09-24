# mock/start-bff.ps1 — run the FI BFF (rvl-sbqr-fi-gateway) against the
# mock sbqr.api for offline emulator runs. Runs in the foreground; Ctrl+C stops it.
#
#   pwsh mock/start-bff.ps1                      # BFF :8080 → sbqr.api :5201
#   pwsh mock/start-bff.ps1 -Port 8090 -Upstream http://localhost:5201
#   pwsh mock/start-bff.ps1 -Port 8090 -NoBuild   # reuse the existing Debug build
#                                                 # (needed while another BFF instance locks bin/)
param(
  [int]$Port = 8080,
  [string]$Upstream = "http://localhost:5201",
  [string]$Idp = "http://localhost:5105",
  [string]$GatewayRepo = "$PSScriptRoot/../../rvl-sbqr-fi-gateway",
  [switch]$NoBuild
)

$env:ASPNETCORE_ENVIRONMENT        = "Development"
$env:ASPNETCORE_URLS               = "http://localhost:$Port"
$env:Auth__Authority               = $Idp
$env:Auth__Issuer                  = $Idp
$env:Auth__Audience                = "sbqr-fi-gateway"
$env:Auth__UserSubClaimType        = "sub"
$env:Auth__RequireHttpsMetadata    = "false"
$env:Platform__BaseUrl             = $Upstream
$env:Platform__TokenEndpoint       = "/v1/oauth/token"
$env:Platform__ClientId            = "dev-fi-client"
$env:Platform__ClientSecret        = "dev-fi-secret"
$env:Platform__Scope               = "sbqr.api"
$env:Platform__BootJitterSecondsMax = "1"
$env:Platform__ContractPath        = ""
$env:Idempotency__Salt             = "dev-salt-min-32-bytes-please-replace-1234"
$env:Idempotency__BucketSeconds    = "60"

$runArgs = @("run", "--project", "$GatewayRepo/src/SBQR.FiGateway.Api", "--no-launch-profile")
if ($NoBuild) { $runArgs += "--no-build" }
dotnet @runArgs
