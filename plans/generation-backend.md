# Use the generation backend when local.env is absent

Status: shipped `f8600f1` (adapter) and `4befdbd` (model references).

Add an IAM/AWS CLI adapter for the deployed generation wire contract. Automatic
selection depends strictly on local.env absence (ENOENT), not missing individual
keys or any provider failure. Preserve explicit local/mock selection. Require a
shared --job-id for backend accounting; derive request ids deterministically from
operation payloads, never retry failed provider work. Download exact S3 versions,
verify hashes and retain pointers in local manifests. Reject unsupported backend
image sizes, voices/models/settings and audio bounds before calls. Report missing
AWS/backend setup clearly.

Ran isolated mocked adapter/selection tests and all repository required checks:
typecheck, test, lint, test:modes. Pushed to origin main. Live backend integration
verified with NIM FLUX 3 Klein and Stable Diffusion 3.5 Large fallback.
