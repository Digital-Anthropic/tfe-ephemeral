/**
 * TypeScript types for Terraform Enterprise/Cloud API
 */

/**
 * Action types supported by the action
 */
export type ActionType = 'create' | 'delete' | 'apply' | 'destroy'

/**
 * VCS configuration for a workspace
 */
export interface VCSConfig {
  repository: string
  branch?: string
  'oauth-token-id': string
}

/**
 * Variables for a workspace (key-value pairs)
 */
export interface WorkspaceVariables {
  [key: string]: string | number | boolean
}

/**
 * Configuration for a single workspace
 */
export interface WorkspaceConfig {
  vcs?: VCSConfig
  variables?: WorkspaceVariables
  'auto-apply'?: boolean
  'terraform-version'?: string
  'execution-mode'?: 'remote' | 'local' | 'agent'
  'variable-set-id'?: string
  dependsOn?: string[]
}

/**
 * Full YAML configuration structure
 */
export interface TFEConfig {
  action: ActionType
  workspaces: {
    [name: string]: WorkspaceConfig
  }
}

/**
 * Workspace attributes for creation
 */
export interface WorkspaceAttributes {
  name: string
  'auto-apply'?: boolean
  'terraform-version'?: string
  'execution-mode'?: 'remote' | 'local' | 'agent'
  'vcs-repo'?: {
    identifier: string
    'oauth-token-id': string
    branch?: string
  }
}

/**
 * Request body for creating a workspace
 * Uses JSON API format required by TFE
 */
export interface TFEWorkspaceRequest {
  data: {
    type: 'workspaces'
    attributes: WorkspaceAttributes
  }
}

/**
 * Response from TFE workspace creation
 * Uses JSON API format
 */
export interface TFEWorkspaceResponse {
  data: {
    id: string
    type: 'workspaces'
    attributes: {
      name: string
      'auto-apply': boolean
      'terraform-version': string
      'execution-mode': string
      'html-url': string
      created: string
      'updated-at': string
      // Additional fields exist but not all are needed
    }
    relationships?: Record<string, unknown>
    links?: {
      self: string
    }
  }
}

/**
 * TFE API error response
 */
export interface TFEErrorResponse {
  errors?: Array<{
    status?: string
    title?: string
    detail?: string
  }>
}

/**
 * Variable category types
 */
export type VariableCategory = 'terraform' | 'env'

/**
 * Request body for creating a variable
 */
export interface TFEVariableRequest {
  data: {
    type: 'vars'
    attributes: {
      key: string
      value: string
      category: VariableCategory
      hcl?: boolean
      sensitive?: boolean
    }
  }
}

/**
 * Response from TFE variable creation
 */
export interface TFEVariableResponse {
  data: {
    id: string
    type: 'vars'
    attributes: {
      key: string
      value: string
      category: VariableCategory
      hcl: boolean
      sensitive: boolean
    }
  }
}

/**
 * Run status types
 */
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

/**
 * Request body for creating a run
 */
export interface TFERunRequest {
  data: {
    type: 'runs'
    attributes: {
      message?: string
      'auto-apply'?: boolean
      'is-destroy'?: boolean
    }
    relationships: {
      workspace: {
        data: {
          type: 'workspaces'
          id: string
        }
      }
    }
  }
}

/**
 * Response from TFE run creation
 */
export interface TFERunResponse {
  data: {
    id: string
    type: 'runs'
    attributes: {
      status: RunStatus
      'status-timestamps': Record<string, string>
      message: string
      'auto-apply': boolean
      'is-destroy': boolean
      'created-at': string
      'has-changes': boolean
      actions: {
        'is-confirmable': boolean
        'is-cancelable': boolean
        'is-discardable': boolean
      }
    }
    relationships: {
      workspace: {
        data: {
          type: 'workspaces'
          id: string
        }
      }
      plan: {
        data: {
          type: 'plans'
          id: string
        }
      }
      apply?: {
        data: {
          type: 'applies'
          id: string
        }
      }
    }
    links: {
      self: string
    }
  }
}

/**
 * Request body for attaching variable set to workspace
 */
export interface TFEVariableSetAttachRequest {
  data: Array<{
    type: 'workspaces'
    id: string
  }>
}
