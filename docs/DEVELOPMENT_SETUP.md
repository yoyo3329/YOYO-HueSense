# YOYO / HueSense Development Setup

## 1. Current architecture

```text
Git / canonical source
  YOYO_CODE_ROOT
  Local example: D:\docker\color-search-test

Docker
  Control Center / Web runtime

Windows Local Runner
  Research execution host

Certified Python
  YOYO_PYTHON_EXE
  Local example: C:\yoyo_env\a21_clean_repro\Scripts\python.exe

Research data
  YOYO_DATA_ROOT
  Local example: D:\YOYO_DATA

XAMPP
  LEGACY / ROLLBACK ARCHIVE ONLY
```

Do not treat `C:\xampp\htdocs\color-search-test` as current source, config, model-lock, or runner authority.

## 2. First clone

```powershell
git clone https://github.com/yoyo3329/YOYO-HueSense.git
cd YOYO-HueSense
```

Set machine-local paths. Example:

```powershell
$env:YOYO_CODE_ROOT   = (Get-Location).Path
$env:YOYO_PYTHON_EXE = 'C:\path\to\certified\python.exe'
$env:YOYO_DATA_ROOT   = 'D:\YOYO_DATA'
```

Persist them using your preferred Windows environment-variable mechanism if needed.

## 3. Docker / Control Center

Docker is for the Control Center and Web runtime. From the repository root:

```powershell
docker compose up -d --build
docker compose ps
```

Do not assume research inference runs inside the containers.

## 4. Windows Local Runner

Research A2 inference runs on Windows and consumes explicit authority inputs.

Current A2 runner:

```text
tools\b1\stylecolor-v0.8a2.1-clean-repro\node\run_clean_repro.js
```

Required arguments:

```text
--root
--a1-run
--baseline-a2-run
--python
--config
--sam-lock
--openclip-lock
--env-pre
```

Missing arguments must fail fast, for example:

```text
MISSING_REQUIRED_ARGUMENT:--root
```

No XAMPP fallback is allowed.

## 5. A2 path authority

`--root` is mandatory and must point to the `tools\b1` directory belonging to the runner's own repository checkout.

If `YOYO_CODE_ROOT` is set, the runner also verifies that:

```text
--root == YOYO_CODE_ROOT\tools\b1
```

`YOYO_CODE_ROOT` is a machine-local declaration, not a silent fallback. The runner never substitutes a missing `--root` from the environment.

Example:

```powershell
$toolsRoot = Join-Path $env:YOYO_CODE_ROOT 'tools\b1'
node "$toolsRoot\stylecolor-v0.8a2.1-clean-repro\node\run_clean_repro.js" `
  --root "$toolsRoot" `
  --a1-run "<current A1 run>" `
  --baseline-a2-run "<exact baseline snapshot>" `
  --python "$env:YOYO_PYTHON_EXE" `
  --config "$toolsRoot\stylecolor-v0.8a2.1-clean-repro\config\stylecolor_v0_8a2_1_clean_repro.config.json" `
  --sam-lock "$toolsRoot\stylecolor-v0.8a2.1-clean-repro\certification\sam_lock.json" `
  --openclip-lock "$toolsRoot\stylecolor-v0.8a2.1-clean-repro\certification\openclip_lock.json" `
  --env-pre "$toolsRoot\stylecolor-v0.8a2.1-clean-repro\certification\environment_pre.json"
```

Do not substitute an arbitrary historical A2 run for the baseline.

## 6. Python environment

The certified environment is external to Git.

Local example:

```text
C:\yoyo_env\a21_clean_repro\Scripts\python.exe
```

Teammates may use a different path, but must reproduce the certified dependency/model identities before claiming equivalent research authority.

Model weights are not stored in Git.

## 7. Data and generated outputs are external

Do not commit:

- reference datasets / source images
- generated runs
- A1/A2/B1 output directories
- result reports
- logs and caches
- model weights/checkpoints
- Control Center runtime state
- package execution history
- local baselines
- Drive-only artifacts

GitHub is canonical source + reproducible setup authority, not generated-data backup.

## 8. Secrets

Do not commit:

- `.env`
- `config/config.php`
- API keys
- tokens
- passwords
- credentials
- private machine configuration

Use placeholders / example config only.

Before commit:

```powershell
git diff --cached
```

Search staged content for terms such as:

```text
api_key
token
password
secret
Bearer
sk-
serpapi
OpenRouter
```

A match is a review signal, not automatic proof of a secret.

## 9. Current research gate

Current DEV45 mainline:

```text
Canonical Dataset      PASS
A1 Bridge              PASS
A1                     PASS
Contract Hardening     PASS
A2.1 DEV               PASS
Rebase DEV             READY
B1 DEV                 WAIT
```

A2 gate:

```text
PASS_DEV45_A2_READY_FOR_REBASE
```

B2 remains:

```text
HOLD_COLOR_EVIDENCE_AUTHORITY
```

A2 PASS does not release B2.

Color evidence flow:

```text
DEV45
  ↓
A2
  ↓
B1
  ↓
COLOR_EVIDENCE_AUTHORITY_READY
  ↓
B2
```

Current DEV45 Color Evidence Audit summary:

```text
TOTAL                    45
HIGH                     24
MEDIUM                    7
LOW                      10
INSUFFICIENT              4
STYLE_ONLY                2
MONOCHROME                2
LOW_CHROMA               20
BACKGROUND_DOMINATED      6
DOWNWEIGHT_RECOMMENDED   21
```

The generated audit output itself is not committed merely to document this policy.

## 10. Validate local repo vs GitHub

Before synchronization:

```powershell
git status
git rev-parse HEAD
git rev-parse origin/main
git diff
git diff --stat
git ls-files --others --exclude-standard
```

A matching commit SHA does not imply a matching working tree. `git status` must also be inspected.

After a real push, refresh remote state and verify local HEAD against the intended remote branch.

## 11. Teammate reproducibility checklist

A teammate should be able to determine from GitHub alone:

1. Docker runs Web / Control Center.
2. Windows Local Runner runs research inference.
3. `YOYO_CODE_ROOT`, `YOYO_PYTHON_EXE`, and `YOYO_DATA_ROOT` are machine-local.
4. XAMPP is not used for current execution.
5. Datasets and model weights must be acquired separately.
6. Secrets are configured locally.
7. A2 arguments are explicit.
8. B2 remains held until Color Evidence Authority is ready.

If these cannot be understood from the repository, synchronization is incomplete.
