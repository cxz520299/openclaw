# OpenClaw Local Maintenance

## Local source of truth

Current cloud deployment has been synced to:

`D:\openclaw\server-openclaw`

Edit files there and deploy back to ECS.

## Files you should treat carefully

- `server-openclaw/.env`: live secrets and tokens
- `server-openclaw/data/`: runtime state, memory, reports, sqlite, logs

These are intentionally ignored by `D:\openclaw\.gitignore` so you can initialize Git safely later.

## Main deployment files

- `server-openclaw/compose.yml`
- `server-openclaw/Dockerfile`
- `server-openclaw/openclaw.json`
- `server-openclaw/Caddyfile`
- `server-openclaw/okinto-openai-proxy.mjs`
- `server-openclaw/services/`
- `server-openclaw/plugins/`

## Deploy back to ECS

From PowerShell:

```powershell
cd D:\openclaw
.\deploy-openclaw.ps1
```

This script uploads the maintained deployment files back to `root@8.147.63.36:/opt/openclaw` and runs:

```bash
docker compose up -d --build
```

## Notes

- The current ECS deployment is not a Git repo. Local maintenance is based on the live server snapshot.
- `data/` should usually stay on the server. It contains runtime state rather than source code.
- If you want, the next step is to split this into:
  - deployable source
  - persistent runtime data
  - optional Git repo for versioning

## Git baseline

This workspace can be versioned safely because the following are ignored:

- `server-openclaw/.env`
- `server-openclaw/.env.bak-*`
- `server-openclaw/data/`

Use `server-openclaw/.env.example` as the committed environment template.
