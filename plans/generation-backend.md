# Use the generation backend when local.env is absent

Status: in progress. User authorized maintainer edits and public push.

Add an IAM/AWS CLI adapter for the deployed generation wire contract. Automatic
selection depends strictly on local.env absence (ENOENT), not missing individual
keys or any provider failure. Preserve explicit local/mock selection. Require a
shared --job-id for backend accounting; derive request ids deterministically from
operation payloads, never retry failed provider work. Download exact S3 versions,
verify hashes and retain pointers in local manifests. Reject unsupported backend
image sizes, voices/models/settings and audio bounds before calls. Report missing
AWS/backend setup clearly. Do not modify AWS resources or make paid calls.

Run isolated mocked adapter/selection tests and all repository required checks:
typecheck, test, lint, test:modes. Obtain independent review, scan candidate files
for secrets, commit and push only this standalone public repository.
