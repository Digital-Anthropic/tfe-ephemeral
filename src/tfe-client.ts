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
  WaitForRunOptions,
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

    for (const [key, rawValue] of Object.entries(variables)) {
      const isConfig =
        typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue

      const value = isConfig ? String(rawValue.value) : String(rawValue)
      const category =
        isConfig && rawValue.category ? rawValue.category : 'terraform'
      const sensitive = isConfig ? Boolean(rawValue.sensitive) : false
      const hcl = isConfig ? Boolean(rawValue.hcl) : false

      const payload: TFEVariableRequest = {
        data: {
          type: 'vars',
          attributes: { key, value, category, hcl, sensitive }
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
   * Polls a run until it reaches a terminal state.
   *
   * Transient poll failures (network blips, 5xx/429 responses) are tolerated
   * with exponential backoff: the run keeps progressing server-side, so a
   * single bad poll must not fail the whole operation. Only repeated
   * consecutive failures give up.
   *
   * @param runId - The run ID
   * @param timeout - Max time to wait in milliseconds (default: 30 minutes)
   * @param options - Poll tuning and run URL context for error messages
   * @returns The final run data
   */
  /**
   * Fetches and prints the Terraform diagnostics for a failed run.
   *
   * TFC exposes plan/apply output through a short-lived pre-signed `log-read-url`.
   * The log is JSON Lines with a plain-text preamble, so lines are parsed
   * individually and unparseable ones skipped.
   *
   * Diagnostics are best-effort: any failure here is reported but never thrown,
   * so it cannot mask the underlying run failure.
   *
   * @param run - The failed run
   */
  private async logRunDiagnostics(run: TFERunResponse): Promise<void> {
    // Pre-signed URLs reject requests carrying an unexpected Authorization
    // header, so fetch the log body with a clean client.
    const rawClient = new httpm.HttpClient('tfe-workspace-action')

    // `relationships` is absent on some API shapes; a diagnostics helper must
    // never throw, or it replaces the real run failure with a TypeError.
    const rels = run.data?.relationships
    const targets: Array<{ kind: string; id: string | undefined }> = [
      { kind: 'plan', id: rels?.plan?.data?.id },
      { kind: 'apply', id: rels?.apply?.data?.id }
    ]

    for (const { kind, id } of targets) {
      if (!id) continue

      try {
        const meta = await this.client.getJson<{
          data: { attributes: { 'log-read-url'?: string } }
        }>(`https://${this.hostname}/api/v2/${kind}s/${id}`)

        const logUrl = meta.result?.data?.attributes?.['log-read-url']
        if (!logUrl) continue

        const body = await (await rawClient.get(logUrl)).readBody()
        if (!body.trim()) continue

        const diagnostics: string[] = []
        for (const line of body.split('\n')) {
          if (!line.startsWith('{')) continue
          try {
            const entry = JSON.parse(line) as {
              '@level'?: string
              '@message'?: string
              diagnostic?: {
                summary?: string
                detail?: string
                address?: string
                range?: { filename?: string; start?: { line?: number } }
              }
            }
            if (entry['@level'] !== 'error') continue

            const d = entry.diagnostic
            const where = d?.range?.filename
              ? ` (${d.range.filename}:${d.range.start?.line ?? '?'})`
              : ''
            const addr = d?.address ? ` [${d.address}]` : ''
            diagnostics.push(
              `${d?.summary ?? entry['@message'] ?? 'error'}${addr}${where}` +
                (d?.detail ? `\n    ${d.detail}` : '')
            )
          } catch {
            // Not a JSON log line — nothing to extract from it.
          }
        }

        if (diagnostics.length > 0) {
          core.error(
            `Terraform ${kind} errors:\n${diagnostics.map((d) => `  - ${d}`).join('\n')}`
          )
        } else {
          // Init/provider failures never reach the structured stream.
          const tail = body.trimEnd().split('\n').slice(-30).join('\n')
          core.error(`Terraform ${kind} output (last 30 lines):\n${tail}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        core.warning(`Could not read ${kind} log for run failure: ${message}`)
      }
    }
  }

  async waitForRun(
    runId: string,
    timeout: number = 1800000, // 30 minutes
    options: WaitForRunOptions = {}
  ): Promise<TFERunResponse> {
    const url = `https://${this.hostname}/api/v2/runs/${runId}`
    const startTime = Date.now()
    const pollInterval = options.pollInterval ?? 5000 // 5 seconds
    const maxConsecutivePollFailures = options.maxConsecutivePollFailures ?? 5

    // Human-facing run URL, included in errors so failures can be inspected
    // in the TFE UI without hunting from the workspace name alone
    const runUrl =
      options.organization && options.workspaceName
        ? `https://${this.hostname}/app/${options.organization}/workspaces/${options.workspaceName}/runs/${runId}`
        : undefined
    const urlSuffix = runUrl ? ` (${runUrl})` : ''

    let consecutivePollFailures = 0

    core.info(`Waiting for run ${runId} to complete...`)

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Run ${runId} timed out after ${timeout / 1000} seconds${urlSuffix}`
        )
      }

      let run: TFERunResponse
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

        run = response.result
        consecutivePollFailures = 0
      } catch (error) {
        consecutivePollFailures++
        const message = error instanceof Error ? error.message : String(error)

        if (consecutivePollFailures > maxConsecutivePollFailures) {
          throw new Error(
            `Failed to poll run status ${consecutivePollFailures} consecutive times: ${message}${urlSuffix}`
          )
        }

        const backoff = pollInterval * 2 ** (consecutivePollFailures - 1)
        core.warning(
          `Poll ${consecutivePollFailures}/${maxConsecutivePollFailures} for run ${runId} failed (${message}); retrying in ${backoff / 1000}s`
        )
        await new Promise((resolve) => setTimeout(resolve, backoff))
        continue
      }

      const status = run.data.attributes.status

      core.info(`Run status: ${status}`)

      // Terminal states
      const terminalStates: RunStatus[] = [
        'applied',
        'planned_and_finished',
        'errored',
        'canceled',
        'force_canceled',
        'discarded'
      ]

      if (terminalStates.includes(status)) {
        if (status === 'applied') {
          core.info(`✅ Run completed successfully: ${runId}`)
        } else if (status === 'planned_and_finished') {
          core.info(`✅ Run completed with no changes to apply: ${runId}`)
        } else if (status === 'errored') {
          // The status alone says nothing about WHY. Callers routinely tear the
          // workspace down on failure, which deletes the run and its logs, so the
          // diagnostic has to be surfaced here or it is lost for good.
          await this.logRunDiagnostics(run)
          throw new Error(`Run failed with status: ${status}${urlSuffix}`)
        } else {
          core.warning(`Run ended with status: ${status}`)
        }
        return run
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
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
