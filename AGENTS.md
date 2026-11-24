# Project guidance

## Public and private information

Keep public documentation, agent instructions, CLI help, examples, comments, commit messages, and PR descriptions portable. Use role-based examples such as `sandbox`, `staging`, `ExampleSite`, `commerce.example`, and clearly named placeholders for tenant, organization, client, project, and host values. Do not copy real installation identifiers from local configuration, environment variables, provider readbacks, live responses, or private handoffs into those surfaces.

Store private installation identities, credential-variable names tied to real instances, deployment targets, merchant configuration, and environment-specific qualification evidence in private operational records outside this repository. Keep credential values in their designated protected stores. Do not put private record paths or links in public artifacts.

Tracked runtime configuration may retain deployment identifiers when the application requires them and the repository intentionally owns that configuration. Tests may use clearly synthetic fixtures and standard upstream sample data. Those exceptions do not authorize copying installation values into prose or examples. Before adding any identifier, establish whether it is a documented public platform constant, an intentional fixture, required runtime configuration, or private installation state; similarity to an existing value is not evidence of its intended publication scope.

Keep general setup, API contracts, release mechanics, and troubleshooting in this repository. Describe sandbox testing and staging-to-production Code Replication generically; keep the actual environment mapping and rollout gates in private operations records. Preserve portable lessons from live testing without publishing the installation identity or a session recap.

## Enforcement and review

The repository provides `.githooks/pre-commit`, which runs `node scripts/check-public-identifiers.js --staged`. Inspect `git config --show-origin --get core.hooksPath` and `git rev-parse --git-path hooks` before installing it. An unset configuration uses Git's default hooks directory. Changing `core.hooksPath` replaces the directory for every hook type, including `pre-push` and `commit-msg`; do not replace an existing hook setup. Integrate the checker command into its owning pre-commit hook instead. Only use `git config core.hooksPath .githooks` after confirming that no active hooks need preserving.

Before each commit, run `npm run check:public-docs -- --staged`. The checker scans staged Markdown and deployment CLI source for recognizable Commerce tenant/organization identifiers, credential-variable suffixes, instance/API hostnames, and UUIDs, including public filenames. Without `--staged`, it checks working-tree contents and reads symlinks as link text without following their targets. The dedicated public-documentation workflow also runs for documentation-only changes. Diagnostics identify the location and identifier format while redacting recognizable identifiers in filenames and omitting matched content values.

Working-tree regular-file reads require no-follow and nonblocking open flags, then use the opened descriptor for type checks and content reads. This rejects a symlink replacement of the final path component at open time and rejects unsupported file types. It does not protect resolution through replaced parent directories. Use `--staged`, which reads Git blobs, when parent directories are untrusted or can be replaced concurrently, or when the platform lacks the required open flags.

The format guard cannot establish publication intent or recognize every site ID, project name, vanity hostname, or provider-specific identifier. Review the complete staged diff for those cases before committing. Keep necessary runtime configuration and synthetic test fixtures outside public prose; do not weaken the guard or add a real identifier to an allowlist to make a public example pass.
