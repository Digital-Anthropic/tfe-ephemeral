# tfe-ephemeral

![Linter](https://github.com/Digital-Anthropic/tfe-ephemeral/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/Digital-Anthropic/tfe-ephemeral/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/Digital-Anthropic/tfe-ephemeral/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/Digital-Anthropic/tfe-ephemeral/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

GitHub Action to manage the full lifecycle of Terraform Enterprise/Cloud
workspaces: create, apply, destroy, and delete multiple workspaces from a single
YAML configuration, with dependency ordering between workspaces.

Built for ephemeral environments: spin up a complete stack (network, database,
service) for a pull request, apply it in dependency order, and tear it down in
reverse order when the PR closes.

## Usage

Pin to an exact release tag.

```yaml
- name: Create workspaces
  uses: Digital-Anthropic/tfe-ephemeral@v1.0.2
  with:
    tfe-token: ${{ secrets.TFE_TOKEN }}
    organization-name: my-org
    config: |
      action: create
      workspaces:
        pr-123-network:
          terraform-version: 1.15.7
          vcs:
            repository: my-org/infra-network
            branch: main
            oauth-token-id: ot-xxxxxxxxxxxx
          variables:
            environment: pr-123
        pr-123-service:
          terraform-version: 1.15.7
          variable-set-id: varset-xxxxxxxxxxxx
          vcs:
            repository: my-org/infra-service
            oauth-token-id: ot-xxxxxxxxxxxx
          variables:
            image_tag: ${{ github.sha }}
            db_password:
              value: ${{ secrets.DB_PASSWORD }}
              sensitive: true
          dependsOn:
            - pr-123-network

- name: Apply workspaces
  uses: Digital-Anthropic/tfe-ephemeral@v1.0.2
  with:
    tfe-token: ${{ secrets.TFE_TOKEN }}
    organization-name: my-org
    config: |
      action: apply
      workspaces:
        pr-123-network: {}
        pr-123-service:
          dependsOn:
            - pr-123-network
```

Teardown (for example on PR close): `destroy` the infrastructure first, then
`delete` the workspaces.

```yaml
- name: Destroy infrastructure
  uses: Digital-Anthropic/tfe-ephemeral@v1.0.2
  with:
    tfe-token: ${{ secrets.TFE_TOKEN }}
    organization-name: my-org
    config: |
      action: destroy
      workspaces:
        pr-123-network: {}
        pr-123-service:
          dependsOn:
            - pr-123-network

- name: Delete workspaces
  uses: Digital-Anthropic/tfe-ephemeral@v1.0.2
  with:
    tfe-token: ${{ secrets.TFE_TOKEN }}
    organization-name: my-org
    config: |
      action: delete
      workspaces:
        pr-123-network: {}
        pr-123-service: {}
```

## Inputs

| Input               | Required | Default            | Description                                           |
| ------------------- | -------- | ------------------ | ----------------------------------------------------- |
| `tfe-token`         | yes      | —                  | Terraform Enterprise/Cloud API token                  |
| `organization-name` | yes      | —                  | TFE/TFC organization name                             |
| `config`            | yes      | —                  | YAML configuration (see below)                        |
| `tfe-hostname`      | no       | `app.terraform.io` | TFE hostname (`app.terraform.io` for Terraform Cloud) |

The token is registered as a masked secret, so it never appears in logs even
when it is not supplied directly from `${{ secrets.* }}`.

## Outputs

| Output          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `workspace-id`  | ID of the first successful workspace (e.g. `ws-xxxx`)   |
| `workspace-url` | URL of the first successful workspace in the TFE/TFC UI |

For multi-workspace configurations, only the first successful workspace is
exposed; query the TFE API for the others.

## Configuration reference

```yaml
action: create # create | delete | apply | destroy
workspaces:
  <workspace-name>:
    # All keys are optional
    auto-apply: false # workspace auto-apply setting (default: false)
    terraform-version: 1.15.7 # default: "latest" — pin this, see note below
    execution-mode: remote # remote | local | agent (default: remote)
    variable-set-id: varset-xxx # variable set to attach to the workspace
    vcs:
      repository: org/repo # required when vcs is set
      oauth-token-id: ot-xxx # required when vcs is set
      branch: main # optional, defaults to the repo default branch
    variables:
      # Scalar form: terraform-category, non-sensitive, non-HCL variable
      environment: production
      # Object form: full control over the variable attributes
      db_password:
        value: secret # required
        sensitive: true # default: false
        category: terraform # terraform | env (default: terraform)
        hcl: false # default: false
    dependsOn: # names of workspaces this one depends on
      - other-workspace
```

> [!IMPORTANT]
>
> Pin `terraform-version` explicitly. When omitted, the workspace is created
> with `latest`, so new Terraform releases change your toolchain without warning
> and can break otherwise-unchanged stacks.

### Action semantics and `dependsOn`

| Action    | Ordering                             | On failure                          |
| --------- | ------------------------------------ | ----------------------------------- |
| `create`  | All workspaces in parallel           | Other workspaces still attempted    |
| `delete`  | All workspaces in parallel           | Other workspaces still attempted    |
| `apply`   | Sequential, dependency order         | Stops at the first failed workspace |
| `destroy` | Sequential, reverse dependency order | Continues to destroy the remaining  |

- `create` provisions the workspace, attaches the variable set (if configured),
  and creates the variables. `dependsOn` is validated but does not order
  creation.
- `apply` and `destroy` trigger an auto-apply run per workspace and wait for it
  to finish before moving to the next workspace. `dependsOn` determines the
  order (topological sort for `apply`, reversed for `destroy`).
- `delete` removes the workspace object from TFE/TFC. It does **not** destroy
  managed infrastructure — always run `destroy` first, otherwise resources are
  orphaned.
- Circular or undefined dependencies fail the action before anything is
  executed.

### Run waiter behavior

For `apply` and `destroy`, each run is polled every 5 seconds until it reaches a
terminal state, with a 30-minute timeout per run:

- `applied` — success.
- `planned_and_finished` — success. A no-changes plan (for example an idempotent
  re-apply) finishes without an apply phase and is treated as a successful run.
- `errored` — the workspace operation fails; the error message includes the TFE
  run URL.
- `canceled`, `force_canceled`, `discarded` — the wait ends with a warning and
  the operation is not marked as failed.

Transient polling problems (network blips, 5xx/429 responses) are tolerated: up
to 5 consecutive poll failures are retried with exponential backoff (5s, 10s,
20s, 40s, 80s) before the operation is failed. The TFE run URL is included in
waiter errors.

## Development

```bash
npm install # install dependencies
npm run all # format, lint, test, coverage badge, bundle dist/
```

The bundled `dist/index.js` is what workflows execute. Any change under `src/`
must be shipped by rebuilding and committing `dist/` (`npm run bundle`); the
`Check dist/` workflow fails PRs where `dist/` does not match the source.

Releases are cut with [`script/release`](./script/release), which creates the
semver tag and keeps the floating major tag (e.g. `v1`) in sync.

## License

[MIT](./LICENSE)
