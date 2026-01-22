#!/usr/bin/env node

const http = require('http')
const https = require('https')
const { URL } = require('url')
const crypto = require('crypto')

// ====================
// HTTP Helper (no deps)
// ====================

/**
 * Makes an HTTP request with JSON support
 * @param {string} url - Full URL
 * @param {object} options - Request options
 * @param {string} options.method - HTTP method
 * @param {object} [options.body] - JSON body (auto-stringified)
 * @param {object} [options.headers] - Additional headers
 * @param {string} [options.apiKey] - Optional API key
 * @returns {Promise<any>} Parsed JSON response
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    // Add API key if provided
    if (options.apiKey) {
      headers['x-api-key'] = options.apiKey
    }

    let bodyData = ''
    if (options.body) {
      bodyData = JSON.stringify(options.body)
      headers['Content-Length'] = Buffer.byteLength(bodyData)
    }

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers
    }

    const req = client.request(reqOptions, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk.toString()
      })

      res.on('end', () => {
        // Handle non-2xx responses
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)
          error.statusCode = res.statusCode
          error.response = data
          return reject(error)
        }

        // Parse JSON response
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve(parsed)
        } catch (err) {
          reject(new Error(`Failed to parse JSON response: ${err.message}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`))
    })

    if (bodyData) {
      req.write(bodyData)
    }

    req.end()
  })
}

// ====================
// CLI Implementation
// ====================

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const parsed = {
    server: 'http://localhost:8787',
    title: 'Agent Test Run',
    steps: 10,
    interval: 500,
    apiKey: null,
    failAt: null
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '--server':
        parsed.server = next
        i++
        break
      case '--title':
        parsed.title = next
        i++
        break
      case '--steps':
        parsed.steps = parseInt(next, 10)
        i++
        break
      case '--interval':
        parsed.interval = parseInt(next, 10)
        i++
        break
      case '--apiKey':
        parsed.apiKey = next
        i++
        break
      case '--failAt':
        parsed.failAt = parseInt(next, 10)
        i++
        break
      case '--help':
      case '-h':
        console.log(`
Usage: node index.js [options]

Options:
  --server <url>      Server URL (default: http://localhost:8787)
  --title <string>    Run title (default: "Agent Test Run")
  --steps <number>    Number of steps to execute (default: 10)
  --interval <ms>     Interval between steps in ms (default: 500)
  --apiKey <key>      Optional API key for authentication
  --failAt <step>     Fail at specific step number (for testing error path)
  --help, -h          Show this help message

Examples:
  # Success run
  node index.js --title "My Test Run" --steps 10 --interval 500

  # Forced error at step 5
  node index.js --title "Error Test" --failAt 5

  # With API key
  node index.js --apiKey your-secret-key --title "Authenticated Run"
`)
        process.exit(0)
        break
    }
  }

  return parsed
}

/**
 * Generate a random UUID v4
 */
function generateUUID() {
  return crypto.randomUUID()
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate a random task name
 */
function randomTaskName() {
  const tasks = [
    'fetch_data',
    'process_records',
    'transform_results',
    'validate_output',
    'store_artifacts',
    'send_notification',
    'cleanup_resources',
    'compile_report'
  ]
  return tasks[Math.floor(Math.random() * tasks.length)]
}

/**
 * Generate a random metric value
 */
function randomMetric(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Main agent runner
 */
async function runAgent(config) {
  const { server, title, steps, interval, apiKey, failAt } = config

  console.log('🤖 Agent Runner Starting...')
  console.log(`   Server: ${server}`)
  console.log(`   Title: ${title}`)
  console.log(`   Steps: ${steps}`)
  console.log(`   Interval: ${interval}ms`)
  if (failAt !== null) {
    console.log(`   ⚠️  Will fail at step: ${failAt}`)
  }
  console.log('')

  let runId = null
  let taskId = null

  try {
    // Step 1: Create a run
    console.log('📝 Creating run...')
    const createResponse = await httpRequest(`${server}/api/runs`, {
      method: 'POST',
      body: { title },
      apiKey
    })
    runId = createResponse.id
    console.log(`✅ Run created: ${runId}`)
    console.log('')

    // Step 2: Post "run.started" event
    console.log('🚀 Posting run.started event...')
    await httpRequest(`${server}/api/runs/${runId}/events`, {
      method: 'POST',
      body: {
        type: 'run.started',
        payload: {
          message: 'Agent run initialized',
          config: { steps, interval }
        }
      },
      apiKey
    })
    console.log('✅ Run started')
    console.log('')

    // Step 3: Update metadata early in the run
    console.log('📊 Updating metadata...')
    await httpRequest(`${server}/api/runs/${runId}`, {
      method: 'PATCH',
      body: {
        metadata: {
          estimatedCost: 0.05,
          tags: ['test', 'automated'],
          totalSteps: steps,
          environment: 'cli'
        }
      },
      apiKey
    })
    console.log('✅ Metadata updated')
    console.log('')

    // Step 4: Execute steps with periodic events
    console.log(`🔄 Executing ${steps} steps...`)
    for (let i = 1; i <= steps; i++) {
      // Check if we should fail at this step
      if (failAt !== null && i === failAt) {
        throw new Error(`Simulated failure at step ${i}`)
      }

      console.log(`   Step ${i}/${steps}`)

      // Log event
      await httpRequest(`${server}/api/runs/${runId}/events`, {
        method: 'POST',
        body: {
          type: 'task.progress',
          level: 'info',
          payload: {
            step: i,
            total: steps,
            message: `Processing step ${i}`,
            progress: Math.round((i / steps) * 100)
          }
        },
        apiKey
      })

      // Randomly emit different event types
      const eventType = Math.random()

      if (eventType < 0.3) {
        // Tool call event
        const toolName = ['ReadFile', 'WriteFile', 'RunCommand', 'SearchCode'][Math.floor(Math.random() * 4)]
        taskId = generateUUID()

        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'tool.called',
            taskId,
            payload: {
              toolName,
              args: { path: `/tmp/file_${i}.txt` }
            }
          },
          apiKey
        })

        // Tool result
        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'tool.result',
            taskId,
            payload: {
              toolName,
              result: `Success: processed ${randomMetric(100, 1000)} bytes`,
              duration: randomMetric(10, 500)
            }
          },
          apiKey
        })
      } else if (eventType < 0.6) {
        // Metric event
        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'task.progress',
            level: 'debug',
            payload: {
              metricName: 'latencyMs',
              value: randomMetric(50, 300),
              step: i
            }
          },
          apiKey
        })
      } else {
        // Agent task event
        taskId = generateUUID()
        const taskName = randomTaskName()

        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'task.progress',
            agentId: 'agent-runner',
            taskId,
            payload: {
              taskName,
              status: 'running',
              step: i
            }
          },
          apiKey
        })

        // Complete task
        await sleep(interval / 2)
        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'task.progress',
            agentId: 'agent-runner',
            taskId,
            payload: {
              taskName,
              status: 'done',
              step: i,
              result: 'completed successfully'
            }
          },
          apiKey
        })
      }

      // Wait before next step
      if (i < steps) {
        await sleep(interval)
      }
    }

    console.log('✅ All steps completed')
    console.log('')

    // Step 5: Post "run.completed" terminal event
    console.log('🎉 Posting run.completed event...')
    await httpRequest(`${server}/api/runs/${runId}/events`, {
      method: 'POST',
      body: {
        type: 'run.completed',
        payload: {
          message: 'Agent run completed successfully',
          totalSteps: steps,
          duration: steps * interval
        }
      },
      apiKey
    })
    console.log('✅ Run completed successfully')
    console.log('')
    console.log(`📊 View in dashboard: http://localhost:5173`)
    console.log(`   Run ID: ${runId}`)

  } catch (err) {
    console.error('')
    console.error('❌ Error occurred:', err.message)
    console.error('')

    if (runId) {
      console.log('📝 Posting run.error event...')

      try {
        // Post error event (server will auto-update status)
        await httpRequest(`${server}/api/runs/${runId}/events`, {
          method: 'POST',
          body: {
            type: 'run.error',
            level: 'error',
            payload: {
              message: err.message,
              stack: err.stack
            }
          },
          apiKey
        })

        // Also PATCH as fallback
        await httpRequest(`${server}/api/runs/${runId}`, {
          method: 'PATCH',
          body: {
            status: 'error',
            errorMessage: err.message
          },
          apiKey
        })

        console.log('✅ Error recorded')
        console.log('')
        console.log(`📊 View in dashboard: http://localhost:5173`)
        console.log(`   Run ID: ${runId}`)
      } catch (reportErr) {
        console.error('⚠️  Failed to report error to server:', reportErr.message)
      }
    }

    process.exit(1)
  }
}

// ====================
// Entry Point
// ====================

if (require.main === module) {
  const args = process.argv.slice(2)
  const config = parseArgs(args)
  runAgent(config).catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

module.exports = { httpRequest, runAgent, parseArgs }
