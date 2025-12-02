/**
 * Dependency resolution for workspace operations
 * Implements topological sort for apply/destroy operations
 */

import { TFEConfig } from './types.js'

/**
 * Resolves workspace execution order based on dependencies
 *
 * @param config - The TFE configuration
 * @returns Array of workspace names in execution order
 * @throws Error if circular dependencies are detected
 */
export function resolveExecutionOrder(config: TFEConfig): string[] {
  const workspaceNames = Object.keys(config.workspaces)

  // For create/delete: parallel execution (no ordering needed)
  if (config.action === 'create' || config.action === 'delete') {
    return workspaceNames
  }

  // For apply: topological sort (forward dependencies)
  if (config.action === 'apply') {
    return topologicalSort(config.workspaces, workspaceNames)
  }

  // For destroy: reverse topological sort (backward dependencies)
  if (config.action === 'destroy') {
    return topologicalSort(config.workspaces, workspaceNames).reverse()
  }

  throw new Error(`Unknown action: ${config.action}`)
}

/**
 * Performs topological sort on workspaces based on dependencies
 *
 * @param workspaces - Workspace configurations
 * @param names - Workspace names to sort
 * @returns Sorted array of workspace names
 * @throws Error if circular dependencies detected
 */
function topologicalSort(
  workspaces: TFEConfig['workspaces'],
  names: string[]
): string[] {
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string, path: string[] = []): void {
    // Circular dependency detection
    if (visiting.has(name)) {
      const cycle = [...path, name].join(' -> ')
      throw new Error(`Circular dependency detected: ${cycle}`)
    }

    // Already processed
    if (visited.has(name)) {
      return
    }

    visiting.add(name)

    // Visit dependencies first
    const workspace = workspaces[name]
    const dependencies = workspace?.dependsOn || []

    for (const dep of dependencies) {
      if (!workspaces[dep]) {
        throw new Error(
          `Workspace '${name}' depends on '${dep}', but '${dep}' is not defined`
        )
      }
      visit(dep, [...path, name])
    }

    visiting.delete(name)
    visited.add(name)
    sorted.push(name)
  }

  // Visit all workspaces
  for (const name of names) {
    visit(name)
  }

  return sorted
}

/**
 * Validates workspace configuration for dependency issues
 *
 * @param config - The TFE configuration
 * @throws Error if validation fails
 */
export function validateDependencies(config: TFEConfig): void {
  const workspaceNames = new Set(Object.keys(config.workspaces))

  for (const [name, workspace] of Object.entries(config.workspaces)) {
    const dependencies = workspace.dependsOn || []

    for (const dep of dependencies) {
      if (!workspaceNames.has(dep)) {
        throw new Error(
          `Workspace '${name}' depends on '${dep}', but '${dep}' is not defined in the configuration`
        )
      }

      // Self-dependency check
      if (dep === name) {
        throw new Error(`Workspace '${name}' cannot depend on itself`)
      }
    }
  }

  // Try to resolve order to catch circular dependencies
  try {
    if (config.action === 'apply' || config.action === 'destroy') {
      resolveExecutionOrder(config)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Dependency validation failed: ${error.message}`)
    }
    throw error
  }
}
