/**
 * Unit tests for TFEClient
 */
import { jest } from '@jest/globals'

// Mock @actions/core
const mockInfo = jest.fn()
const mockDebug = jest.fn()
const mockError = jest.fn()
const mockWarning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
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

// Import after mocking
const { TFEClient } = await import('../src/tfe-client.js')

describe('TFEClient', () => {
  let client: InstanceType<typeof TFEClient>

  beforeEach(() => {
    jest.clearAllMocks()
    client = new TFEClient('app.terraform.io', 'test-token')
  })

  describe('createWorkspace', () => {
    it('handles no response result', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 201,
        result: null
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('No response data from TFE API')
    })

    it('logs VCS error details on failure', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 422,
        result: {
          errors: [
            {
              status: '422',
              title: 'Unprocessable Entity',
              detail: 'OAuth token is invalid'
            }
          ]
        }
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace', {
          vcs: {
            repository: 'owner/repo',
            branch: 'main',
            'oauth-token-id': 'ot-123'
          }
        })
      ).rejects.toThrow('OAuth token is invalid')

      // Verify VCS details were logged
      expect(mockError).toHaveBeenCalledWith('VCS Repository: owner/repo')
      expect(mockError).toHaveBeenCalledWith('VCS OAuth Token: ot-123')
      expect(mockError).toHaveBeenCalledWith('VCS Branch: main')
    })

    it('handles non-Error exceptions', async () => {
      mockPostJson.mockRejectedValue('string error')

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('Failed to create workspace: string error')
    })
  })

  describe('createVariables', () => {
    it('handles no response result', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 201,
        result: null
      })

      await expect(
        client.createVariables('ws-123', { key1: 'value1' })
      ).rejects.toThrow('No response data from TFE API')
    })

    it('handles non-201 status code', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 422,
        result: {
          errors: [
            {
              status: '422',
              title: 'Unprocessable Entity',
              detail: 'Variable key is invalid'
            }
          ]
        }
      })

      await expect(
        client.createVariables('ws-123', { key1: 'value1' })
      ).rejects.toThrow('Variable key is invalid')
    })

    it('handles non-Error exceptions', async () => {
      mockPostJson.mockRejectedValue({ error: 'object error' })

      await expect(
        client.createVariables('ws-123', { key1: 'value1' })
      ).rejects.toThrow('Failed to create variable')
    })
  })

  describe('deleteWorkspace', () => {
    it('handles non-204 status code', async () => {
      mockDel.mockResolvedValue({
        message: { statusCode: 404 }
      })

      await expect(
        client.deleteWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('HTTP 404: Failed to delete workspace')
    })

    it('handles non-Error exceptions', async () => {
      mockDel.mockRejectedValue(123)

      await expect(
        client.deleteWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('Failed to delete workspace: 123')
    })
  })

  describe('createRun', () => {
    it('handles non-201 status code', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 422,
        result: {
          errors: [
            {
              status: '422',
              title: 'Unprocessable Entity',
              detail: 'Workspace is locked'
            }
          ]
        }
      })

      await expect(
        client.createRun('ws-123', 'Test run', false, true)
      ).rejects.toThrow('Workspace is locked')
    })

    it('handles no response result', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 201,
        result: null
      })

      await expect(
        client.createRun('ws-123', 'Test run', false, true)
      ).rejects.toThrow('No response data from TFE API')
    })

    it('handles non-Error exceptions', async () => {
      mockPostJson.mockRejectedValue(null)

      await expect(
        client.createRun('ws-123', 'Test run', false, true)
      ).rejects.toThrow('Failed to create run: null')
    })
  })

  describe('waitForRun', () => {
    it('handles timeout', async () => {
      // Mock getJson to return planning status (non-terminal)
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: { status: 'planning' }
          }
        }
      })

      // Set a very short timeout to test the timeout logic
      await expect(client.waitForRun('run-123', 1)).rejects.toThrow(
        'Run run-123 timed out after 0.001 seconds'
      )
    }, 10000)

    it('handles non-200 status code', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 500,
        result: null
      })

      await expect(client.waitForRun('run-123')).rejects.toThrow(
        'Failed to get run status: HTTP 500'
      )
    })

    it('handles no response result', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: null
      })

      await expect(client.waitForRun('run-123')).rejects.toThrow(
        'No response data from TFE API'
      )
    })

    it('handles canceled status', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: {
              status: 'canceled'
            }
          }
        }
      })

      const result = await client.waitForRun('run-123')

      expect(mockWarning).toHaveBeenCalledWith(
        'Run ended with status: canceled'
      )
      expect(result.data.attributes.status).toBe('canceled')
    })

    it('handles force_canceled status', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: {
              status: 'force_canceled'
            }
          }
        }
      })

      const result = await client.waitForRun('run-123')

      expect(mockWarning).toHaveBeenCalledWith(
        'Run ended with status: force_canceled'
      )
      expect(result.data.attributes.status).toBe('force_canceled')
    })

    it('handles discarded status', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: {
          data: {
            id: 'run-123',
            type: 'runs',
            attributes: {
              status: 'discarded'
            }
          }
        }
      })

      const result = await client.waitForRun('run-123')

      expect(mockWarning).toHaveBeenCalledWith(
        'Run ended with status: discarded'
      )
      expect(result.data.attributes.status).toBe('discarded')
    })

    it('handles non-Error exceptions in polling', async () => {
      mockGetJson.mockRejectedValue('polling error')

      await expect(client.waitForRun('run-123')).rejects.toThrow(
        'Failed to poll run status'
      )
    })
  })

  describe('formatError', () => {
    it('formats 401 error without error details', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 401,
        result: {}
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('HTTP 401: Unauthorized - Invalid TFE token')
    })

    it('formats 404 error without error details', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 404,
        result: {}
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('HTTP 404: Organization not found')
    })

    it('formats 422 error without error details', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 422,
        result: {}
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow(
        'HTTP 422: Unprocessable Entity - Check workspace name and organization'
      )
    })

    it('formats unknown status code without error details', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 500,
        result: {}
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('HTTP 500: Request failed')
    })

    it('formats error with undefined status code', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: undefined,
        result: {}
      })

      await expect(
        client.createWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('HTTP unknown: Request failed')
    })
  })

  describe('getWorkspace', () => {
    it('successfully gets workspace details', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: {
          data: {
            id: 'ws-abc123',
            type: 'workspaces',
            attributes: {
              name: 'test-workspace',
              'auto-apply': false
            }
          }
        }
      })

      const result = await client.getWorkspace('test-org', 'test-workspace')

      expect(result.data.id).toBe('ws-abc123')
      expect(mockInfo).toHaveBeenCalledWith(
        'Getting workspace: test-org/test-workspace'
      )
      expect(mockInfo).toHaveBeenCalledWith('✅ Workspace found: ws-abc123')
    })

    it('handles non-200 status code', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 404,
        result: {
          errors: [
            {
              status: '404',
              title: 'Not Found',
              detail: 'Workspace not found'
            }
          ]
        }
      })

      await expect(
        client.getWorkspace('test-org', 'nonexistent')
      ).rejects.toThrow('Workspace not found')
    })

    it('handles no response result', async () => {
      mockGetJson.mockResolvedValue({
        statusCode: 200,
        result: null
      })

      await expect(
        client.getWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('No response data from TFE API')
    })

    it('handles non-Error exceptions', async () => {
      mockGetJson.mockRejectedValue('Network error')

      await expect(
        client.getWorkspace('test-org', 'test-workspace')
      ).rejects.toThrow('Failed to get workspace: Network error')
    })
  })

  describe('attachVariableSet', () => {
    it('successfully attaches variable set', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 204,
        result: {}
      })

      await expect(
        client.attachVariableSet('varset-123', 'ws-abc')
      ).resolves.toBeUndefined()

      expect(mockInfo).toHaveBeenCalledWith(
        'Attaching variable set varset-123 to workspace ws-abc'
      )
      expect(mockInfo).toHaveBeenCalledWith(
        '✅ Variable set attached successfully'
      )
    })

    it('handles non-204 status code', async () => {
      mockPostJson.mockResolvedValue({
        statusCode: 404,
        result: {
          errors: [
            {
              status: '404',
              title: 'Not Found',
              detail: 'Variable set not found'
            }
          ]
        }
      })

      await expect(
        client.attachVariableSet('varset-invalid', 'ws-abc')
      ).rejects.toThrow('Variable set not found')
    })

    it('handles non-Error exceptions', async () => {
      mockPostJson.mockRejectedValue('Network error')

      await expect(
        client.attachVariableSet('varset-123', 'ws-abc')
      ).rejects.toThrow('Failed to attach variable set: Network error')
    })
  })
})
