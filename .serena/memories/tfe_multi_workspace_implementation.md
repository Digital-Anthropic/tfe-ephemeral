# TFE Multi-Workspace Implementation

## Overview

This GitHub Action manages multiple Terraform Enterprise/Cloud workspaces with
dependency resolution, supporting create, delete, apply, and destroy operations.

## Key Design Decisions

### Execution Strategy

- **Create/Delete**: Parallel execution - no dependency ordering needed
- **Apply/Destroy**: Sequential execution respecting dependencies
  - Apply: Forward order (network → database → application)
  - Destroy: Reverse order (application → database → network)

### Single vs Multi-Workspace

Single workspace is just a special case of multi-workspace with one node in the
graph - no need for separate implementations.

## YAML Configuration Schema

```yaml
action: create | delete | apply | destroy

workspaces:
  <workspace-name>:
    vcs:
      repository: owner/repo-name
      branch: main # optional, defaults to default branch
      oauth-token-id: ot-xxxxx
    variable-set-id: varset-xxxxx # optional, attaches variable set to workspace
    variables:
      key1: value1
      key2: value2
    auto-apply: false # optional
    terraform-version: latest # optional
    execution-mode: remote # optional: remote | local | agent
    dependsOn: # optional, only used for apply/destroy
      - workspace1
      - workspace2
```

### Example Configuration

```yaml
action: create
workspaces:
  network:
    vcs:
      repository: Digital-Anthropic/devops-mindset
      branch: main
      oauth-token-id: ot-GkFHtgR9VjXJ8irx
    variable-set-id: varset-abc123 # Attach shared variable set
    variables:
      environment: production
      region: us-east-1
      vpc_cidr: 10.0.0.0/16
    auto-apply: false
    terraform-version: latest
    execution-mode: remote

  database:
    vcs:
      repository: Digital-Anthropic/devops-mindset
      oauth-token-id: ot-GkFHtgR9VjXJ8irx
    variable-set-id: varset-abc123 # Same variable set for all workspaces
    variables:
      environment: production
      db_instance_type: db.t3.micro
    dependsOn:
      - network

  application:
    vcs:
      repository: Digital-Anthropic/devops-mindset
      oauth-token-id: ot-GkFHtgR9VjXJ8irx
    variable-set-id: varset-abc123
    variables:
      environment: production
      app_name: my-application
      instance_count: 2
    dependsOn:
      - network
      - database
```

## Dependency Resolution

### Algorithm: Topological Sort

- Uses DFS (Depth-First Search) based topological sort
- Detects circular dependencies and throws error
- Only applied for apply/destroy operations
- Create/delete operations ignore dependencies and run in parallel

### Implementation Location

`src/dependency-resolver.ts`

```typescript
export function resolveExecutionOrder(config: TFEConfig): string[] {
  const workspaceNames = Object.keys(config.workspaces)

  // For create/delete: return all workspace names (parallel execution)
  if (config.action === 'create' || config.action === 'delete') {
    return workspaceNames
  }

  // For apply: topological sort (forward order)
  if (config.action === 'apply') {
    return topologicalSort(config.workspaces, workspaceNames)
  }

  // For destroy: reverse topological sort
  if (config.action === 'destroy') {
    return topologicalSort(config.workspaces, workspaceNames).reverse()
  }
}
```

### Circular Dependency Detection

```typescript
export function validateDependencies(config: TFEConfig): void {
  // Validates no circular dependencies exist
  // Validates all dependencies reference existing workspaces
  // Throws error if validation fails
}
```

## TFE API Integration

### Base URL

- Terraform Cloud: `https://app.terraform.io`
- Terraform Enterprise: `https://<your-hostname>`

### Authentication

```
Authorization: Bearer <tfe-token>
Content-Type: application/vnd.api+json
```

### API Endpoints Used

#### 1. Create Workspace

**Endpoint**: `POST /api/v2/organizations/{organization}/workspaces`

**Request Body**:

```json
{
  "data": {
    "type": "workspaces",
    "attributes": {
      "name": "workspace-name",
      "auto-apply": false,
      "terraform-version": "latest",
      "execution-mode": "remote",
      "vcs-repo": {
        "identifier": "owner/repo",
        "oauth-token-id": "ot-xxxxx",
        "branch": "main"
      }
    }
  }
}
```

**Response**: 201 Created

```json
{
  "data": {
    "id": "ws-xxxxx",
    "type": "workspaces",
    "attributes": {
      "name": "workspace-name",
      "html-url": "https://app.terraform.io/app/org/workspaces/workspace-name"
    }
  }
}
```

#### 2. Get Workspace

**Endpoint**:
`GET /api/v2/organizations/{organization}/workspaces/{workspace-name}`

**Response**: 200 OK

```json
{
  "data": {
    "id": "ws-xxxxx",
    "type": "workspaces",
    "attributes": {
      "name": "workspace-name",
      "auto-apply": false,
      "terraform-version": "1.5.0",
      "html-url": "https://app.terraform.io/app/org/workspaces/workspace-name"
    }
  }
}
```

**Usage**: Used before creating runs to fetch the actual workspace ID (ws-xxxxx
format).

#### 3. Attach Variable Set to Workspace

**Endpoint**: `POST /api/v2/varsets/{varset-id}/relationships/workspaces`

**Request Body**:

```json
{
  "data": [
    {
      "type": "workspaces",
      "id": "ws-xxxxx"
    }
  ]
}
```

**Response**: 204 No Content

**Usage**: Attaches a variable set to one or more workspaces during workspace
creation. The variable set must already exist.

#### 4. Create Variables

**Endpoint**: `POST /api/v2/workspaces/{workspace-id}/vars`

**Request Body**:

```json
{
  "data": {
    "type": "vars",
    "attributes": {
      "key": "variable_name",
      "value": "variable_value",
      "category": "terraform",
      "hcl": false,
      "sensitive": false
    }
  }
}
```

#### 5. Delete Workspace

**Endpoint**:
`DELETE /api/v2/organizations/{organization}/workspaces/{workspace-name}`

**Response**: 204 No Content

#### 6. Create Run

**Endpoint**: `POST /api/v2/runs`

**Request Body**:

```json
{
  "data": {
    "type": "runs",
    "attributes": {
      "message": "Apply triggered by GitHub Actions",
      "auto-apply": true,
      "is-destroy": false
    },
    "relationships": {
      "workspace": {
        "data": {
          "type": "workspaces",
          "id": "ws-xxxxx"
        }
      }
    }
  }
}
```

**Important**: The workspace ID must be in `ws-xxxxx` format (not
`org/workspace-name`). Use the Get Workspace endpoint to fetch this ID first.

**Response**: 201 Created

```json
{
  "data": {
    "id": "run-xxxxx",
    "type": "runs",
    "attributes": {
      "status": "pending",
      "auto-apply": true,
      "is-destroy": false
    }
  }
}
```

#### 7. Get Run Status

**Endpoint**: `GET /api/v2/runs/{run-id}`

**Run Status Values**:

- `pending` - Run is queued
- `plan_queued` - Plan is queued
- `planning` - Plan is running
- `planned` - Plan completed
- `apply_queued` - Apply is queued
- `applying` - Apply is running
- `applied` - ✅ Apply completed successfully
- `errored` - ❌ Run failed
- `canceled` - Run was canceled
- `force_canceled` - Run was force canceled
- `discarded` - Run was discarded

**Terminal States**: `applied`, `errored`, `canceled`, `force_canceled`,
`discarded`

### Run Polling Strategy

- Poll interval: 5 seconds
- Default timeout: 30 minutes (1800000ms)
- Waits until run reaches terminal state
- Throws error if run fails or times out

## TypeScript Type System

### Core Types

```typescript
export type ActionType = 'create' | 'delete' | 'apply' | 'destroy'

export interface TFEConfig {
  action: ActionType
  workspaces: {
    [name: string]: WorkspaceConfig
  }
}

export interface WorkspaceConfig {
  vcs?: VCSConfig
  variables?: WorkspaceVariables
  'auto-apply'?: boolean
  'terraform-version'?: string
  'execution-mode'?: 'remote' | 'local' | 'agent'
  'variable-set-id'?: string
  dependsOn?: string[]
}

export interface VCSConfig {
  repository: string
  branch?: string
  'oauth-token-id': string
}

export interface WorkspaceVariables {
  [key: string]: string | number | boolean
}

export type RunStatus =
  | 'pending'
  | 'plan_queued'
  | 'planning'
  | 'planned'
  | 'cost_estimating'
  | 'cost_estimated'
  | 'policy_checking'
  | 'policy_override'
  | 'policy_soft_failed'
  | 'policy_checked'
  | 'confirmed'
  | 'apply_queued'
  | 'applying'
  | 'applied'
  | 'discarded'
  | 'errored'
  | 'canceled'
  | 'force_canceled'
```

## Architecture

### File Structure

```
src/
├── index.ts                  # Entry point
├── main.ts                   # Main logic, YAML parsing, orchestration
├── types.ts                  # TypeScript type definitions
├── tfe-client.ts            # TFE API client
├── workspace-manager.ts     # Multi-workspace orchestration
└── dependency-resolver.ts   # Dependency resolution & topological sort
```

### Component Responsibilities

#### TFEClient (`src/tfe-client.ts`)

- Low-level API communication
- Methods:
  - `createWorkspace(organization, name, options)` - Creates workspace with VCS
  - `getWorkspace(organization, name)` - Fetches workspace details and ID
  - `attachVariableSet(variableSetId, workspaceId)` - Attaches variable set to
    workspace
  - `createVariables(workspaceId, variables)` - Creates variables
  - `deleteWorkspace(organization, name)` - Deletes workspace
  - `createRun(workspaceId, message, isDestroy, autoApply)` - Creates run
  - `waitForRun(runId, timeout)` - Polls run until completion

#### WorkspaceManager (`src/workspace-manager.ts`)

- High-level workspace orchestration
- Methods:
  - `execute(config)` - Main entry point, delegates to action-specific methods
  - `createWorkspaces()` - Parallel workspace creation
  - `deleteWorkspaces()` - Parallel workspace deletion
  - `applyWorkspaces()` - Sequential apply with dependency order
  - `destroyWorkspaces()` - Sequential destroy in reverse order

#### DependencyResolver (`src/dependency-resolver.ts`)

- Dependency graph validation and resolution
- Functions:
  - `validateDependencies(config)` - Validates dependency graph
  - `resolveExecutionOrder(config)` - Returns execution order
  - `topologicalSort(workspaces, names)` - DFS-based topological sort

### Execution Flow

1. **main.ts**: Parse YAML input using `js-yaml`
2. **main.ts**: Create TFEClient with hostname and token
3. **main.ts**: Create WorkspaceManager with client and organization
4. **WorkspaceManager.execute()**: Validate dependencies
5. **DependencyResolver**: Resolve execution order based on action type
6. **WorkspaceManager**: Execute action-specific method
   - Create: Parallel execution → Attach variable sets → Create variables
   - Delete: Parallel execution
   - Apply: Fetch workspace IDs → Sequential execution with dependencies
   - Destroy: Fetch workspace IDs → Sequential execution in reverse order
7. **TFEClient**: Make API calls with detailed logging
8. **main.ts**: Report results summary

## Action Inputs

Defined in `action.yml`:

```yaml
inputs:
  tfe-token:
    description: Terraform Enterprise/Cloud API token
    required: true
  organization-name:
    description: TFE/TFC organization name
    required: true
  config:
    description: YAML configuration for workspaces (inline YAML in workflow)
    required: true
  tfe-hostname:
    description: TFE hostname (use app.terraform.io for Terraform Cloud)
    default: 'app.terraform.io'
```

## Error Handling

### Apply Operation

- Stop on first failure
- Prevents dependent workspaces from running if dependency fails

### Destroy Operation

- Continue on failure
- Attempts to destroy as many resources as possible
- Logs warnings but doesn't stop

### API Errors

Common status codes:

- `401`: Unauthorized - Invalid TFE token
- `404`: Not found - Organization, workspace, or variable set doesn't exist
- `422`: Unprocessable Entity
  - Invalid workspace name
  - OAuth token doesn't exist
  - Repository doesn't exist or isn't accessible

## Local Testing

### Environment Variables

Create `.env` file:

```bash
ACTIONS_STEP_DEBUG=true
INPUT_TFE-TOKEN=your-token-here
INPUT_ORGANIZATION-NAME=your-org
INPUT_CONFIG="action: create
workspaces:
  test-workspace:
    vcs:
      repository: owner/repo
      oauth-token-id: ot-xxxxx
    variable-set-id: varset-xxxxx
    variables:
      env: test"
INPUT_TFE-HOSTNAME=app.terraform.io
```

**Important**: Use `INPUT_TFE-TOKEN` (with hyphens), NOT `INPUT_TFE_TOKEN` (with
underscores)

### Run Locally

```bash
npm install
npm run build
node dist/index.js
```

## Dependencies

### Production

- `@actions/core` - GitHub Actions toolkit
- `@actions/http-client` - HTTP client for API calls
- `js-yaml` - YAML parsing

### Development

- TypeScript
- Rollup (bundler)
- ESLint
- Prettier
- Jest

## API Documentation References

- [TFE Workspaces API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/workspaces)
- [TFE Variables API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/workspace-variables)
- [TFE Variable Sets API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/variable-sets)
- [TFE Runs API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/run)
- [TFE OAuth Tokens API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/oauth-tokens)

## Testing Status

✅ **Tested and Working**:

- Create operation (parallel, multiple workspaces)
- Delete operation (parallel, multiple workspaces)

🔄 **Implemented, Not Yet Tested**:

- Variable set attachment during create
- Apply operation (sequential with dependencies, using ws-xxxxx IDs)
- Destroy operation (sequential reverse order, using ws-xxxxx IDs)

## Recent Improvements

### Workspace ID Resolution (2025-11-06)

- Added `getWorkspace()` method to fetch workspace details
- Now uses proper workspace IDs (`ws-xxxxx`) instead of `org/workspace-name` in
  run creation
- Prevents 404 errors when creating runs

### Variable Set Support (2025-11-06)

- Added `attachVariableSet()` method to attach variable sets to workspaces
- Supports `variable-set-id` in workspace configuration
- Variable sets are attached after workspace creation, before variables
- Allows sharing common variables across multiple workspaces

### Enhanced Logging

- Added detailed request/response logging for all API calls
- Shows full payload being sent to TFE API
- Easier debugging of API integration issues

## Future Enhancements (Not Implemented)

Potential features for future development:

- Support for environment variables (category: 'env')
- Support for sensitive variables
- Support for HCL variables
- Configurable run timeout
- Plan-only mode (no auto-apply)
- Workspace tags
- Notification configurations
- Agent pool assignment
- Project assignment
