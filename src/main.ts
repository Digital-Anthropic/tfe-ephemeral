import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import { TFEClient } from './tfe-client.js'
import { WorkspaceManager } from './workspace-manager.js'
import { TFEConfig } from './types.js'

/**
 * The main function for the action.
 * Manages multiple TFE/TFC workspaces based on YAML configuration.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get required inputs
    const token = core.getInput('tfe-token', { required: true })
    const organization = core.getInput('organization-name', { required: true })
    const configYaml = core.getInput('config', { required: true })
    const hostname = core.getInput('tfe-hostname') || 'app.terraform.io'

    core.info(`TFE Hostname: ${hostname}`)
    core.info(`Organization: ${organization}`)

    // Parse YAML configuration
    let config: TFEConfig
    try {
      config = yaml.load(configYaml) as TFEConfig
    } catch (error) {
      throw new Error(
        `Failed to parse YAML configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    // Validate configuration
    if (!config.action) {
      throw new Error(
        'Configuration must specify an action (create, delete, apply, or destroy)'
      )
    }

    if (!config.workspaces || Object.keys(config.workspaces).length === 0) {
      throw new Error('Configuration must specify at least one workspace')
    }

    const validActions = ['create', 'delete', 'apply', 'destroy']
    if (!validActions.includes(config.action)) {
      throw new Error(
        `Invalid action: ${config.action}. Must be one of: ${validActions.join(', ')}`
      )
    }

    // Create TFE client and workspace manager
    const client = new TFEClient(hostname, token)
    const manager = new WorkspaceManager(client, organization)

    // Execute the operation
    const results = await manager.execute(config)

    // Process results
    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    // Set outputs (for single workspace case or first successful workspace)
    if (successful.length > 0 && successful[0].workspaceId) {
      core.setOutput('workspace-id', successful[0].workspaceId)
      core.setOutput('workspace-url', successful[0].workspaceUrl)
    }

    // Summary
    core.info('')
    core.info('='.repeat(50))
    core.info(`Action: ${config.action}`)
    core.info(`Total workspaces: ${results.length}`)
    core.info(`Successful: ${successful.length}`)
    core.info(`Failed: ${failed.length}`)
    core.info('='.repeat(50))

    if (successful.length > 0) {
      core.info('✅ Successful workspaces:')
      successful.forEach((r) => {
        core.info(
          `   - ${r.workspace}${r.workspaceId ? ` (${r.workspaceId})` : ''}`
        )
      })
    }

    if (failed.length > 0) {
      core.warning('❌ Failed workspaces:')
      failed.forEach((r) => {
        core.warning(`   - ${r.workspace}: ${r.error}`)
      })

      // Fail the action if any workspace failed
      core.setFailed(`${failed.length} workspace(s) failed`)
    } else {
      core.info('🎉 All operations completed successfully!')
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`)
    }
  }
}
