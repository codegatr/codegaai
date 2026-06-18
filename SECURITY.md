# CODEGA AI Security Notes

## Windows Malware/PUA False Positives

CODEGA AI Desktop is an Electron application packaged with NSIS. Unsigned
Windows installers can be flagged by reputation-based scanners such as
Malwarebytes even when the application code is clean.

Recommended release requirements:

- Build only through GitHub Actions.
- Publish SHA-256 checksums with every release.
- Sign Windows installers with an Authenticode code-signing certificate.
- Keep `requestedExecutionLevel` as `asInvoker`.
- Do not ship Python runtime cache, logs, model files, or user data.
- Keep updater signature verification enabled by default.

GitHub repository secrets for signed Windows releases:

- `WINDOWS_CSC_LINK`: base64 encoded `.pfx` certificate, or a supported secure
  certificate URL.
- `WINDOWS_CSC_KEY_PASSWORD`: certificate password.

Unsigned updater bypass exists only for emergency diagnostics:

```powershell
$env:CODEGA_ALLOW_UNSIGNED_UPDATES="1"
```

Do not use that bypass for public releases.

## Artifact Verification

Every desktop release should include `SHA256SUMS.txt`. Users can verify the
installer hash before running it:

```powershell
Get-FileHash .\CODEGA-AI-0.1.10-win-x64.exe -Algorithm SHA256
```

Compare the hash with the matching line in `SHA256SUMS.txt`.

## Secret Handling

Never commit API keys, GitHub tokens, model provider tokens, `.env` files, or
`config.php`. Rotate any token that was pasted into an issue, chat, or terminal
history.
