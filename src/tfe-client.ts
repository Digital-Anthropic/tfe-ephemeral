/**
 * TFE/TFC API Client
 * Handles communication with Terraform Enterprise/Cloud API
 */

import * as core from '@actions/core'
import * as httpm from '@actions/http-client'
import {
  TFEWorkspaceRequest,
  TFEWorkspaceResponse,
  TFEErrorResponse,
  TFEVariableRequest,
  TFEVariableResponse,
  TFEVariableSetAttachRequest,
  TFERunRequest,
  TFERunResponse,
  RunStatus,
  VCSConfig,
  WorkspaceVariables
} from './types.js'

/**
 * Client for interacting with Terraform Enterprise/Cloud API
 */
export class TFEClient {
  private client: httpm.HttpClient
  private hostname: string
  private token: string

  /**
   * Creates a new TFE API client
   *
   * @param hostname - TFE hostname (e.g., 'app.terraform.io' for Terraform Cloud)
   * @param token - TFE API token
   */
  constructor(hostname: string, token: string) {
    this.hostname = hostname
    this.token = token

    // Create HTTP client with proper headers for TFE API
    this.client = new httpm.HttpClient('tfe-workspace-action', [], {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json'
      }
    })
  }

  /**
   * Creates a new workspace in TFE/TFC
   *
   * @param organization - The organization name
   * @param workspaceName - The name for the new workspace
   * @param options - Optional workspace configuration
   * @returns The created workspace data
   */
  async createWorkspace(
    organization: string,
    workspaceName: string,
    options?: {
      autoApply?: boolean
      terraformVersion?: string
      executionMode?: 'remote' | 'local' | 'agent'
      vcs?: VCSConfig
    }
  ): Promise<TFEWorkspaceResponse> {
    const url = `https://${this.hostname}/api/v2/organizations/${organization}/workspaces`

    // Build the request payload in JSON API format
    const payload: TFEWorkspaceRequest = {
      data: {
        type: 'workspaces',
        attributes: {
          name: workspaceName,
          'auto-apply': options?.autoApply ?? false,
          'terraform-version': options?.terraformVersion ?? 'latest',
          'execution-mode': options?.executionMode ?? 'remote'
        }
      }
    }

    // Add VCS configuration if provided
    if (options?.vcs) {
      core.info(`Configuring VCS for workspace: ${workspaceName}`)
      core.info(`  Repository: ${options.vcs.repository}`)
      core.info(`  OAuth Token ID: ${options.vcs['oauth-token-id']}`)
      core.info(`  Branch: ${options.vcs.branch || 'default'}`)

      payload.data.attributes['vcs-repo'] = {
        identifier: options.vcs.repository,
        'oauth-token-id': options.vcs['oauth-token-id'],
        branch: options.vcs.branch
      }
    }

    core.info(`Creating workspace: ${workspaceName} in org: ${organization}`)
    core.info(`Request URL: ${url}`)
    core.info(`Full request payload:`)
    core.info(JSON.stringify(payload, null, 2))

    try {
      const response = await this.client.postJson<TFEWorkspaceResponse>(
        url,
        payload
      )

      core.info(`Response status: ${response.statusCode}`)

      // Log full response for debugging
      if (response.statusCode !== 201) {
        core.error(
          `Failed response body: ${JSON.stringify(response.result, null, 2)}`
        )
      }

      // Check for successful creation (201 Created)
      if (response.statusCode !== 201) {
        const errorData = response.result as unknown as TFEErrorResponse
        const errorMessage = this.formatError(response.statusCode, errorData)

        // Add detailed error info
        core.error(`Workspace: ${workspaceName}`)
        core.error(`Organization: ${organization}`)
        core.error(`API Error: ${errorMessage}`)
        if (options?.vcs) {
          core.error(`VCS Repository: ${options.vcs.repository}`)
          core.error(`VCS OAuth Token: ${options.vcs['oauth-token-id']}`)
          core.error(`VCS Branch: ${options.vcs.branch || '(default)'}`)
        }

        throw new Error(errorMessage)
      }

      if (!response.result) {
        throw new Error('No response data from TFE API')
      }

      return response.result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create workspace: ${message}`)
    }
  }

  /**
   * Creates variables for a workspace
   *
   * @param workspaceId - The workspace ID
   * @param variables - Key-value pairs of variables
   * @returns Array of created variables
   */
  async createVariables(
    workspaceId: string,
    variables: WorkspaceVariables
  ): Promise<TFEVariableResponse[]> {
    const url = `https://${this.hostname}/api/v2/workspaces/${workspaceId}/vars`
    const results: TFEVariableResponse[] = []

    core.debug(
      `Creating ${Object.keys(variables).length} variables for workspace ${workspaceId}`
    )

    for (const [key, value] of Object.entries(variables)) {
      const payload: TFEVariableRequest = {
        data: {
          type: 'vars',
          attributes: {
            key,
            value: String(value),
            category: 'terraform',
            hcl: false,
            sensitive: false
          }
        }
      }

      try {
        const response = await this.client.postJson<TFEVariableResponse>(
          url,
          payload
        )

        if (response.statusCode !== 201) {
          const errorData = response.result as unknown as TFEErrorResponse
          const errorMessage = this.formatError(response.statusCode, errorData)
          throw new Error(errorMessage)
        }

        if (!response.result) {
          throw new Error('No response data from TFE API')
        }

        results.push(response.result)
        core.debug(`Created variable: ${key}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to create variable '${key}': ${message}`)
      }
    }

    return results
  }

  /**
   * Attaches a variable set to a workspace
   *
   * @param variableSetId - The variable set ID (varset-xxxxx)
   * @param workspaceId - The workspace ID (ws-xxxxx)
   */
  async attachVariableSet(
    variableSetId: string,
    workspaceId: string
  ): Promise<void> {
    const url = `https://${this.hostname}/api/v2/varsets/${variableSetId}/relationships/workspaces`

    const payload: TFEVariableSetAttachRequest = {
      data: [
        {
          type: 'workspaces',
          id: workspaceId
        }
      ]
    }

    core.info(
      `Attaching variable set ${variableSetId} to workspace ${workspaceId}`
    )
    core.info(`📤 Request URL: ${url}`)
    core.info(`📤 Request Payload: ${JSON.stringify(payload, null, 2)}`)

    try {
      const response = await this.client.postJson(url, payload)

      if (response.statusCode !== 204) {
        const errorData = response.result as unknown as TFEErrorResponse
        const errorMessage = this.formatError(response.statusCode, errorData)
        throw new Error(errorMessage)
      }

      core.info(`✅ Variable set attached successfully`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to attach variable set: ${message}`)
    }
  }

  /**
   * Deletes a workspace
   *
   * @param workspaceName - The workspace name
   * @param organization - The organization name
   */
  async deleteWorkspace(
    organization: string,
    workspaceName: string
  ): Promise<void> {
    const url = `https://${this.hostname}/api/v2/organizations/${organization}/workspaces/${workspaceName}`

    core.debug(`Deleting workspace: ${workspaceName} in org: ${organization}`)

    try {
      const response = await this.client.del(url)

      if (response.message.statusCode !== 204) {
        throw new Error(
          `HTTP ${response.message.statusCode}: Failed to delete workspace`
        )
      }

      core.debug(`Workspace deleted: ${workspaceName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to delete workspace: ${message}`)
    }
  }

  /**
   * Creates and triggers a run for a workspace
   *
   * @param workspaceId - The workspace ID
   * @param message - Run message/description
   * @param isDestroy - Whether this is a destroy run
   * @param autoApply - Whether to auto-apply
   * @returns The created run data
   */
  /**
   * Gets workspace details by name
   *
   * @param organization - Organization name
   * @param workspaceName - Workspace name
   * @returns The workspace data including ID
   */
  async getWorkspace(
    organization: string,
    workspaceName: string
  ): Promise<TFEWorkspaceResponse> {
    const url = `https://${this.hostname}/api/v2/organizations/${organization}/workspaces/${workspaceName}`

    core.info(`Getting workspace: ${organization}/${workspaceName}`)

    try {
      const response = await this.client.getJson<TFEWorkspaceResponse>(url)

      if (response.statusCode !== 200) {
        const errorData = response.result as unknown as TFEErrorResponse
        const errorMessage = this.formatError(response.statusCode, errorData)
        throw new Error(errorMessage)
      }

      if (!response.result) {
        throw new Error('No response data from TFE API')
      }

      core.info(`✅ Workspace found: ${response.result.data.id}`)
      return response.result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to get workspace: ${message}`)
    }
  }

  async createRun(
    workspaceId: string,
    message: string,
    isDestroy: boolean = false,
    autoApply: boolean = false
  ): Promise<TFERunResponse> {
    const url = `https://${this.hostname}/api/v2/runs`

    const payload: TFERunRequest = {
      data: {
        type: 'runs',
        attributes: {
          message,
          'auto-apply': autoApply,
          'is-destroy': isDestroy
        },
        relationships: {
          workspace: {
            data: {
              type: 'workspaces',
              id: workspaceId
            }
          }
        }
      }
    }

    core.info(`Creating run for workspace ${workspaceId}`)
    core.info(`  Message: ${message}`)
    core.info(`  Is Destroy: ${isDestroy}`)
    core.info(`  Auto-apply: ${autoApply}`)
    core.info(`📤 Request URL: ${url}`)
    core.info(`📤 Request Payload: ${JSON.stringify(payload, null, 2)}`)

    try {
      const response = await this.client.postJson<TFERunResponse>(url, payload)

      if (response.statusCode !== 201) {
        const errorData = response.result as unknown as TFEErrorResponse
        const errorMessage = this.formatError(response.statusCode, errorData)
        throw new Error(errorMessage)
      }

      if (!response.result) {
        throw new Error('No response data from TFE API')
      }

      core.info(`✅ Run created: ${response.result.data.id}`)
      return response.result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create run: ${message}`)
    }
  }

  /**
   * Polls a run until it reaches a terminal state
   *
   * @param runId - The run ID
   * @param timeout - Max time to wait in milliseconds (default: 30 minutes)
   * @returns The final run data
   */
  async waitForRun(
    runId: string,
    timeout: number = 1800000 // 30 minutes
  ): Promise<TFERunResponse> {
    const url = `https://${this.hostname}/api/v2/runs/${runId}`
    const startTime = Date.now()
    const pollInterval = 5000 // 5 seconds

    core.info(`Waiting for run ${runId} to complete...`)

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Run ${runId} timed out after ${timeout / 1000} seconds`
        )
      }

      try {
        const response = await this.client.getJson<TFERunResponse>(url)

        if (response.statusCode !== 200) {
          throw new Error(
            `Failed to get run status: HTTP ${response.statusCode}`
          )
        }

        if (!response.result) {
          throw new Error('No response data from TFE API')
        }

        const run = response.result
        const status = run.data.attributes.status

        core.info(`Run status: ${status}`)

        // Terminal states
        const terminalStates: RunStatus[] = [
          'applied',
          'errored',
          'canceled',
          'force_canceled',
          'discarded'
        ]

        if (terminalStates.includes(status)) {
          if (status === 'applied') {
            core.info(`✅ Run completed successfully: ${runId}`)
          } else if (status === 'errored') {
            throw new Error(`Run failed with status: ${status}`)
          } else {
            core.warning(`Run ended with status: ${status}`)
          }
          return run
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        const message = String(error)
        throw new Error(`Failed to poll run status: ${message}`)
      }
    }
  }

  /**
   * Formats error messages from TFE API responses
   *
   * @param statusCode - HTTP status code
   * @param errorData - Error response data
   * @returns Formatted error message
   */
  private formatError(
    statusCode: number | undefined,
    errorData: TFEErrorResponse
  ): string {
    const status = statusCode ?? 'unknown'

    if (errorData?.errors && errorData.errors.length > 0) {
      const errorMessages = errorData.errors
        .map((err) => err.detail || err.title || 'Unknown error')
        .join(', ')
      return `HTTP ${status}: ${errorMessages}`
    }

    // Return generic error messages for common status codes
    switch (statusCode) {
      case 401:
        return 'HTTP 401: Unauthorized - Invalid TFE token'
      case 404:
        return 'HTTP 404: Organization not found'
      case 422:
        return 'HTTP 422: Unprocessable Entity - Check workspace name and organization'
      default:
        return `HTTP ${status}: Request failed`
    }
  }
}
