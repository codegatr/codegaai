$ErrorActionPreference = "Stop"

$models = @(
  "qwen2.5-coder:1.5b",
  "llama3.2:1b"
)

foreach ($model in $models) {
  Write-Host "Preparing $model ..." -ForegroundColor Cyan
  ollama pull $model
}

Write-Host "Lightweight Ollama models are ready." -ForegroundColor Green
