/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * Tests TFE multi-workspace management functionality
 */
import { jest } from '@jest/globals'

// Mock @actions/core
const mockGetInput = jest.fn()
const mockSetOutput = jest.fn()
const mockSetFailed = jest.fn()
const mockInfo = jest.fn()
const mockDebug = jest.fn()
const mockError = jest.fn()
const mockWarning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  info: mockInfo,
  debug: mockDebug,
  error: mockError,
  warning: mockWarning
}))

// Mock @actions/http-client
const mockPostJson = jest.fn()
const mockGetJson = jest.fn()
const mockDel = jest.fn()
const mockHttpClient = jest.fn().mockImplementation(() => ({
  postJson: mockPostJson,
  getJson: mockGetJson,
  del: mockDel
}))

jest.unstable_mockModule('@actions/http-client', () => ({
  HttpClient: mockHttpClient
}))

// Import the module under test
const { run } = await import('../src/main.js')

describe('TFE Multi-Workspace Action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Create Action', () => {
    beforeEach(() => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token-12345',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: create
workspaces:
  workspace1:
    vcs:
      repository: owner/repo
      branch: main
      oauth-token-id: ot-123
    variables:
      env: production
    auto-apply: false
  workspace2:
    vcs:
      repository: owner/repo
      oauth-token-id: ot-123
    variables:
      region: us-east-1`
        }
        return inputs[name] || ''
      })
    })

    it('creates multiple workspaces in parallel', async () => {
      // Mock successful workspace creation
      mockPostJson.mockResolvedValue({
        statusCode: 201,
        result: {
          data: {
            id: 'ws-abc123',
            type: 'workspaces',
            attributes: {
              name: 'workspace1',
              'auto-apply': false,
              'terraform-version': 'latest',
              'execution-mode': 'remote',
              'html-url':
                'https://app.terraform.io/app/test-org/workspaces/workspace1',
              created: '2025-01-01T00:00:00Z',
              'updated-at': '2025-01-01T00:00:00Z'
            }
          }
        }
      })

      await run()

      // Verify both workspaces were created
      expect(mockPostJson).toHaveBeenCalledTimes(4) // 2 workspaces + 2 variable sets
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('Creating 2 workspace(s) in parallel')
      )
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('creates workspace with VCS configuration', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 201,
        result: {
          data: {
            id: 'ws-abc123',
            type: 'workspaces',
            attributes: {
              name: 'workspace1',
              'auto-apply': false,
              'html-url':
                'https://app.terraform.io/app/test-org/workspaces/workspace1',
              created: '2025-01-01T00:00:00Z',
              'updated-at': '2025-01-01T00:00:00Z'
            }
          }
        }
      })

      await run()

      // Verify VCS configuration was included
      expect(mockPostJson).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces'),
        expect.objectContaining({
          data: expect.objectContaining({
            attributes: expect.objectContaining({
              'vcs-repo': expect.objectContaining({
                identifier: 'owner/repo',
                'oauth-token-id': 'ot-123',
                branch: 'main'
              })
            })
          })
        })
      )
    })

    it('handles partial failures gracefully', async () => {
      // First workspace succeeds, second fails
      mockPostJson
        .mockResolvedValueOnce({
          statusCode: 201,
          result: {
            data: {
              id: 'ws-abc123',
              type: 'workspaces',
              attributes: {
                name: 'workspace1',
                'html-url':
                  'https://app.terraform.io/app/test-org/workspaces/workspace1'
              }
            }
          }
        })
        .mockResolvedValueOnce({
          statusCode: 201,
          result: {
            data: { id: 'ws-abc123', type: 'vars' }
          }
        })
        .mockResolvedValueOnce({
          statusCode: 422,
          result: {
            errors: [
              {
                status: '422',
                title: 'Unprocessable Entity',
                detail: 'Workspace name has already been taken'
              }
            ]
          }
        })

      await run()

      // Verify error was logged
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('already been taken')
      )
    })

    it('attaches variable set when configured', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token-12345',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: create
workspaces:
  test-workspace:
    vcs:
      repository: owner/repo
      oauth-token-id: ot-123
    variable-set-id: varset-abc123
    variables:
      env: production`
        }
        return inputs[name] || ''
      })

      // Mock successful workspace creation
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'ws-abc123',
            type: 'workspaces',
            attributes: {
              name: 'test-workspace',
              'html-url':
                'https://app.terraform.io/app/test-org/workspaces/test-workspace'
            }
          }
        }
      })

      // Mock successful variable set attachment
      mockPostJson.mockResolvedValueOnce({
        statusCode: 204,
        result: {}
      })

      // Mock successful variable creation
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: { id: 'var-123', type: 'vars' }
        }
      })

      await run()

      // Verify variable set was attached
      expect(mockPostJson).toHaveBeenCalledWith(
        expect.stringContaining(
          '/varsets/varset-abc123/relationships/workspaces'
        ),
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              type: 'workspaces',
              id: 'ws-abc123'
            })
          ])
        })
      )
      expect(mockSetFailed).not.toHaveBeenCalled()
    })
  })

  describe('Delete Action', () => {
    beforeEach(() => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token-12345',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: delete
workspaces:
  workspace1: {}
  workspace2: {}`
        }
        return inputs[name] || ''
      })
    })

    it('deletes multiple workspaces in parallel', async () => {
      mockDel.mockResolvedValue({
        message: { statusCode: 204 }
      })

      await run()

      // Verify both workspaces were deleted
      expect(mockDel).toHaveBeenCalledTimes(2)
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('Deleting 2 workspace(s) in parallel')
      )
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('handles delete failures', async () => {
      // First workspace succeeds, second fails
      mockDel
        .mockResolvedValueOnce({
          message: { statusCode: 204 }
        })
        .mockResolvedValueOnce({
          message: { statusCode: 404 }
        })

      await run()

      // Verify both delete attempts were made
      expect(mockDel).toHaveBeenCalledTimes(2)
      // Verify error was logged
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete workspace')
      )
    })
  })

  describe('Apply Action', () => {
    beforeEach(() => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token-12345',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: apply
workspaces:
  network:
    variables:
      region: us-east-1
  database:
    dependsOn:
      - network
  application:
    dependsOn:
      - database`
        }
        return inputs[name] || ''
      })
    })

    it('applies workspaces sequentially in dependency order', async () => {
      // For each workspace: getWorkspace, then waitForRun polls
      // Network workspace
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-net',
            type: 'workspaces',
            attributes: { name: 'network' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      // Database workspace
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-db',
            type: 'workspaces',
            attributes: { name: 'database' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      // Application workspace
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-app',
            type: 'workspaces',
            attributes: { name: 'application' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      await run()

      // Verify execution order
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining(
          'Execution order: network → database → application'
        )
      )
      expect(mockPostJson).toHaveBeenCalledTimes(3) // 3 runs
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('stops apply on first failure', async () => {
      // Mock getWorkspace call for first workspace (network)
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-net',
            type: 'workspaces',
            attributes: { name: 'network' }
          }
        }
      })

      // Mock first run creation
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })

      // Mock run status - failed
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: {
              status: 'errored'
            }
          }
        }
      })

      await run()

      // Verify only one run was created (stopped after first failure)
      expect(mockPostJson).toHaveBeenCalledTimes(1)
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Stopping apply process')
      )
    })
  })

  describe('Destroy Action', () => {
    beforeEach(() => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token-12345',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: destroy
workspaces:
  network:
    variables:
      region: us-east-1
  database:
    dependsOn:
      - network
  application:
    dependsOn:
      - database`
        }
        return inputs[name] || ''
      })
    })

    it('destroys workspaces in reverse dependency order', async () => {
      // For each workspace: getWorkspace, createRun, waitForRun
      // Application workspace (first in reverse order)
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-app',
            type: 'workspaces',
            attributes: { name: 'application' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'pending', 'is-destroy': true }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      // Database workspace
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-db',
            type: 'workspaces',
            attributes: { name: 'database' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'pending', 'is-destroy': true }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      // Network workspace
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-net',
            type: 'workspaces',
            attributes: { name: 'network' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'pending', 'is-destroy': true }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      await run()

      // Verify reverse execution order
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining(
          'Execution order: application → database → network'
        )
      )
      expect(mockPostJson).toHaveBeenCalledTimes(3) // 3 destroy runs
    })

    it('continues destroy on failure', async () => {
      // Application workspace (fails)
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-app',
            type: 'workspaces',
            attributes: { name: 'application' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-app',
            type: 'runs',
            attributes: { status: 'errored' }
          }
        }
      })

      // Database workspace (succeeds)
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-db',
            type: 'workspaces',
            attributes: { name: 'database' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-db',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      // Network workspace (succeeds)
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-net',
            type: 'workspaces',
            attributes: { name: 'network' }
          }
        }
      })
      mockPostJson.mockResolvedValueOnce({
        statusCode: 201,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'pending' }
          }
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          data: {
            id: 'run-net',
            type: 'runs',
            attributes: { status: 'applied' }
          }
        }
      })

      await run()

      // Verify all runs were attempted despite failure
      expect(mockPostJson).toHaveBeenCalledTimes(3)
      expect(mockWarning).toHaveBeenCalledWith(
        expect.stringContaining('continuing with remaining workspaces')
      )
    })
  })

  describe('Dependency Validation', () => {
    it('detects circular dependencies', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: apply
workspaces:
  workspace1:
    dependsOn:
      - workspace2
  workspace2:
    dependsOn:
      - workspace1`
        }
        return inputs[name] || ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected')
      )
    })

    it('detects missing dependencies', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: apply
workspaces:
  workspace1:
    dependsOn:
      - nonexistent`
        }
        return inputs[name] || ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("but 'nonexistent' is not defined")
      )
    })
  })

  describe('YAML Parsing', () => {
    it('handles invalid YAML configuration', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: 'invalid: yaml: content: ['
        }
        return inputs[name] || ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse')
      )
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'tfe-token': 'test-token',
          'organization-name': 'test-org',
          'tfe-hostname': 'app.terraform.io',
          config: `action: create
workspaces:
  test: {}`
        }
        return inputs[name] || ''
      })
    })

    it('handles 401 Unauthorized error', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 401,
        result: {
          errors: [
            {
              status: '401',
              title: 'Unauthorized',
              detail: 'Invalid authentication token'
            }
          ]
        }
      })

      await run()

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid authentication token')
      )
    })

    it('handles network errors', async () => {
      mockPostJson.mockRejectedValue(new Error('Network request failed'))

      await run()

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Network request failed')
      )
    })
  })
})
