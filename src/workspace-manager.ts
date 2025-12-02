/**
 * Workspace Manager
 * Orchestrates multi-workspace operations with dependency resolution
 */

import * as core from '@actions/core'
import { TFEClient } from './tfe-client.js'
import { TFEConfig, WorkspaceConfig } from './types.js'
import {
  resolveExecutionOrder,
  validateDependencies
} from './dependency-resolver.js'

/**
 * Result from workspace operation
 */
export interface WorkspaceOperationResult {
  workspace: string
  success: boolean
  workspaceId?: string
  workspaceUrl?: string
  error?: string
}

/**
 * Manages multi-workspace operations
 */
export class WorkspaceManager {
  private client: TFEClient
  private organization: string

  constructor(client: TFEClient, organization: string) {
    this.client = client
    this.organization = organization
  }

  /**
   * Executes the configured action on all workspaces
   *
   * @param config - The TFE configuration
   * @returns Array of operation results
   */
  async execute(config: TFEConfig): Promise<WorkspaceOperationResult[]> {
    // Validate dependencies first
    validateDependencies(config)

    // Get execution order
    const workspaceNames = resolveExecutionOrder(config)

    core.info(`Action: ${config.action}`)
    core.info(`Workspaces to process: ${workspaceNames.join(', ')}`)

    // Execute based on action type
    switch (config.action) {
      case 'create':
        return await this.createWorkspaces(config, workspaceNames)
      case 'delete':
        return await this.deleteWorkspaces(config, workspaceNames)
      case 'apply':
        return await this.applyWorkspaces(config, workspaceNames)
      case 'destroy':
        return await this.destroyWorkspaces(config, workspaceNames)
      default:
        throw new Error(`Unknown action: ${config.action}`)
    }
  }

  /**
   * Creates workspaces in parallel
   *
   * @param config - The TFE configuration
   * @param workspaceNames - Names of workspaces to create
   * @returns Array of operation results
   */
  private async createWorkspaces(
    config: TFEConfig,
    workspaceNames: string[]
  ): Promise<WorkspaceOperationResult[]> {
    core.info(`Creating ${workspaceNames.length} workspace(s) in parallel...`)

    // Create all workspaces in parallel
    const promises = workspaceNames.map((name) =>
      this.createSingleWorkspace(name, config.workspaces[name])
    )

    return await Promise.all(promises)
  }

  /**
   * Creates a single workspace with VCS and variables
   *
   * @param name - Workspace name
   * @param config - Workspace configuration
   * @returns Operation result
   */
  private async createSingleWorkspace(
    name: string,
    config: WorkspaceConfig
  ): Promise<WorkspaceOperationResult> {
    try {
      core.info(`Creating workspace: ${name}`)

      // Create workspace
      const response = await this.client.createWorkspace(
        this.organization,
        name,
        {
          autoApply: config['auto-apply'],
          terraformVersion: config['terraform-version'],
          executionMode: config['execution-mode'],
          vcs: config.vcs
        }
      )

      const workspaceId = response.data.id
      const workspaceUrl = response.data.attributes['html-url']

      core.info(`✅ Workspace created: ${name} (${workspaceId})`)

      // Attach variable set if provided
      if (config['variable-set-id']) {
        core.info(`Attaching variable set to workspace: ${name}`)
        await this.client.attachVariableSet(
          config['variable-set-id'],
          workspaceId
        )
        core.info(`✅ Variable set attached to workspace: ${name}`)
      }

      // Create variables if provided
      if (config.variables && Object.keys(config.variables).length > 0) {
        core.info(`Creating variables for workspace: ${name}`)
        await this.client.createVariables(workspaceId, config.variables)
        core.info(`✅ Variables created for workspace: ${name}`)
      }

      return {
        workspace: name,
        success: true,
        workspaceId,
        workspaceUrl
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      core.error(`❌ Failed to create workspace ${name}: ${errorMessage}`)

      return {
        workspace: name,
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Deletes workspaces in parallel
   *
   * @param config - The TFE configuration
   * @param workspaceNames - Names of workspaces to delete
   * @returns Array of operation results
   */
  private async deleteWorkspaces(
    config: TFEConfig,
    workspaceNames: string[]
  ): Promise<WorkspaceOperationResult[]> {
    core.info(`Deleting ${workspaceNames.length} workspace(s) in parallel...`)

    // Delete all workspaces in parallel
    const promises = workspaceNames.map((name) =>
      this.deleteSingleWorkspace(name)
    )

    return await Promise.all(promises)
  }

  /**
   * Deletes a single workspace
   *
   * @param name - Workspace name
   * @returns Operation result
   */
  private async deleteSingleWorkspace(
    name: string
  ): Promise<WorkspaceOperationResult> {
    try {
      core.info(`Deleting workspace: ${name}`)

      await this.client.deleteWorkspace(this.organization, name)

      core.info(`✅ Workspace deleted: ${name}`)

      return {
        workspace: name,
        success: true
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      core.error(`❌ Failed to delete workspace ${name}: ${errorMessage}`)

      return {
        workspace: name,
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Applies workspaces sequentially (respects dependencies)
   *
   * @param config - The TFE configuration
   * @param workspaceNames - Names of workspaces to apply (in dependency order)
   * @returns Array of operation results
   */
  private async applyWorkspaces(
    config: TFEConfig,
    workspaceNames: string[]
  ): Promise<WorkspaceOperationResult[]> {
    core.info(
      `Applying ${workspaceNames.length} workspace(s) sequentially (respecting dependencies)...`
    )
    core.info(`Execution order: ${workspaceNames.join(' → ')}`)

    const results: WorkspaceOperationResult[] = []

    // Execute sequentially
    for (const name of workspaceNames) {
      const result = await this.applySingleWorkspace(name)
      results.push(result)

      // Stop on failure
      if (!result.success) {
        core.error(
          `Stopping apply process due to failure in workspace: ${name}`
        )
        break
      }
    }

    return results
  }

  /**
   * Applies a single workspace (creates and waits for run)
   *
   * @param name - Workspace name
   * @returns Operation result
   */
  private async applySingleWorkspace(
    name: string
  ): Promise<WorkspaceOperationResult> {
    try {
      core.info(`Applying workspace: ${name}`)

      // Get workspace details to obtain the workspace ID (ws-xxxxx)
      const workspace = await this.client.getWorkspace(this.organization, name)
      const workspaceId = workspace.data.id

      // Create run
      const run = await this.client.createRun(
        workspaceId,
        `Apply triggered by GitHub Actions`,
        false, // not destroy
        true // auto-apply
      )

      core.info(`Run created: ${run.data.id}`)

      // Wait for run to complete
      await this.client.waitForRun(run.data.id)

      core.info(`✅ Workspace applied: ${name}`)

      return {
        workspace: name,
        success: true,
        workspaceId: workspaceId
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      core.error(`❌ Failed to apply workspace ${name}: ${errorMessage}`)

      return {
        workspace: name,
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Destroys workspaces sequentially (reverse dependency order)
   *
   * @param config - The TFE configuration
   * @param workspaceNames - Names of workspaces to destroy (in reverse dependency order)
   * @returns Array of operation results
   */
  private async destroyWorkspaces(
    config: TFEConfig,
    workspaceNames: string[]
  ): Promise<WorkspaceOperationResult[]> {
    core.info(
      `Destroying ${workspaceNames.length} workspace(s) sequentially (reverse dependency order)...`
    )
    core.info(`Execution order: ${workspaceNames.join(' → ')}`)

    const results: WorkspaceOperationResult[] = []

    // Execute sequentially
    for (const name of workspaceNames) {
      const result = await this.destroySingleWorkspace(name)
      results.push(result)

      // Continue on failure (try to destroy as much as possible)
      if (!result.success) {
        core.warning(
          `Failed to destroy workspace ${name}, continuing with remaining workspaces...`
        )
      }
    }

    return results
  }

  /**
   * Destroys a single workspace (creates and waits for destroy run)
   *
   * @param name - Workspace name
   * @returns Operation result
   */
  private async destroySingleWorkspace(
    name: string
  ): Promise<WorkspaceOperationResult> {
    try {
      core.info(`Destroying workspace: ${name}`)

      // Get workspace details to obtain the workspace ID (ws-xxxxx)
      const workspace = await this.client.getWorkspace(this.organization, name)
      const workspaceId = workspace.data.id

      // Create destroy run
      const run = await this.client.createRun(
        workspaceId,
        `Destroy triggered by GitHub Actions`,
        true, // is destroy
        true // auto-apply
      )

      core.info(`Destroy run created: ${run.data.id}`)

      // Wait for run to complete
      await this.client.waitForRun(run.data.id)

      core.info(`✅ Workspace destroyed: ${name}`)

      return {
        workspace: name,
        success: true,
        workspaceId: workspaceId
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      core.error(`❌ Failed to destroy workspace ${name}: ${errorMessage}`)

      return {
        workspace: name,
        success: false,
        error: errorMessage
      }
    }
  }
}
