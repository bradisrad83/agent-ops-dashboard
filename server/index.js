const http = require('http')
const url = require('url')
const { Database } = require('./db')
const { Storage } = require('./storage')

const PORT = process.env.PORT || 8787
const API_KEY = process.env.AGENTOPS_API_KEY

// Initialize database
const db = new Database()
db.initDb()

// Initialize storage with database
const storage = new Storage(db)

// Helper: check API key authentication
function checkAuth(req) {
  // If no API key is configured, auth is disabled
  if (!API_KEY) {
    return true
  }

  // Check for x-api-key header
  const providedKey = req.headers['x-api-key']
  return providedKey === API_KEY
}

// Helper: parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

// Helper: send JSON response
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key'
  })
  res.end(JSON.stringify(data))
}

// Helper: send error
function sendError(res, status, message) {
  sendJSON(res, status, { error: message })
}

// SSE helper with proper headers and event format
function setupSSE(req, res, runId) {
  // Check authentication for SSE
  if (!checkAuth(req)) {
    sendError(res, 401, 'unauthorized')
    return false
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })

  // Send initial comment to establish connection
  res.write(`: connected\n\n`)

  // Event listener - broadcast with SSE id field
  const listener = (event) => {
    try {
      // Ensure JSON is single-line (no embedded newlines that could break SSE)
      const jsonStr = JSON.stringify(event)
      const sanitized = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r')

      // Write SSE format: id field + data field + blank line
      res.write(`id: ${event.id}\n`)
      res.write(`data: ${sanitized}\n\n`)
    } catch (err) {
      console.error('[SSE] Error broadcasting event:', err)
    }
  }

  storage.addListener(runId, listener)

  // Heartbeat every 15 seconds with timestamp
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`)
    } catch (err) {
      // Client disconnected, cleanup will happen in 'close' handler
      clearInterval(heartbeat)
    }
  }, 15000)

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat)
    storage.removeListener(runId, listener)
  })

  req.on('error', (err) => {
    console.error('[SSE] Request error:', err)
    clearInterval(heartbeat)
    storage.removeListener(runId, listener)
  })

  return true
}

// Request handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname
  const method = req.method

  // Handle CORS preflight for all /api/* routes
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key'
    })
    res.end()
    return
  }

  try {
    // GET /api/runs
    if (pathname === '/api/runs' && method === 'GET') {
      if (!checkAuth(req)) {
        sendError(res, 401, 'unauthorized')
        return
      }
      const runs = storage.getRuns()
      sendJSON(res, 200, runs)
      return
    }

    // POST /api/runs
    if (pathname === '/api/runs' && method === 'POST') {
      if (!checkAuth(req)) {
        sendError(res, 401, 'unauthorized')
        return
      }
      const body = await parseBody(req)
      const run = storage.createRun(body)
      sendJSON(res, 201, run)
      return
    }

    // GET /api/runs/:runId/events
    const eventsMatch = pathname.match(/^\/api\/runs\/([^\/]+)\/events$/)
    if (eventsMatch && method === 'GET') {
      if (!checkAuth(req)) {
        sendError(res, 401, 'unauthorized')
        return
      }
      const runId = eventsMatch[1]

      // Parse and validate query params
      const limitRaw = parseInt(parsedUrl.query.limit || '500', 10)
      const limit = Math.min(Math.max(1, limitRaw), 1000) // Cap at 1000
      const after = parsedUrl.query.after || '0'

      const events = storage.getEvents(runId, { limit, after })
      sendJSON(res, 200, events)
      return
    }

    // POST /api/runs/:runId/events
    const postEventsMatch = pathname.match(/^\/api\/runs\/([^\/]+)\/events$/)
    if (postEventsMatch && method === 'POST') {
      if (!checkAuth(req)) {
        sendError(res, 401, 'unauthorized')
        return
      }
      const runId = postEventsMatch[1]

      // Auto-create run if it doesn't exist (consistent behavior)
      if (!storage.getRun(runId)) {
        storage.createRun({ id: runId, title: `Run ${runId}` })
      }

      const body = await parseBody(req)
      const event = storage.addEvent(runId, body)
      sendJSON(res, 201, event)
      return
    }

    // PATCH /api/runs/:runId
    const patchRunMatch = pathname.match(/^\/api\/runs\/([^\/]+)$/)
    if (patchRunMatch && method === 'PATCH') {
      if (!checkAuth(req)) {
        sendError(res, 401, 'unauthorized')
        return
      }
      const runId = patchRunMatch[1]
      const body = await parseBody(req)

      // Check if run exists
      const existingRun = storage.getRun(runId)
      if (!existingRun) {
        sendError(res, 404, 'not_found')
        return
      }

      // Update run
      const updatedRun = storage.updateRun(runId, body)
      sendJSON(res, 200, updatedRun)
      return
    }

    // GET /api/runs/:runId/stream (SSE)
    const streamMatch = pathname.match(/^\/api\/runs\/([^\/]+)\/stream$/)
    if (streamMatch && method === 'GET') {
      const runId = streamMatch[1]

      // Auto-create run if it doesn't exist
      if (!storage.getRun(runId)) {
        storage.createRun({ id: runId, title: `Run ${runId}` })
      }

      setupSSE(req, res, runId)
      return
    }

    // 404
    sendError(res, 404, 'Not found')
  } catch (err) {
    console.error('[Server] Error handling request:', err)

    // Ensure response hasn't been sent yet
    if (!res.headersSent) {
      sendError(res, 500, 'Internal server error')
    }
  }
})

server.listen(PORT, () => {
  console.log(`🚀 Agent Ops Dashboard Server running on http://localhost:${PORT}`)
  console.log(`   API endpoints:`)
  console.log(`   - GET   /api/runs`)
  console.log(`   - POST  /api/runs`)
  console.log(`   - PATCH /api/runs/:runId`)
  console.log(`   - GET   /api/runs/:runId/events?limit=N&after=<cursor>`)
  console.log(`   - POST  /api/runs/:runId/events`)
  console.log(`   - GET   /api/runs/:runId/stream (SSE)`)
  console.log(``)
  console.log(`   Cursor: Use 'after' param with event ID to fetch only newer events`)
  console.log(`   SSE: Events include 'id:' field for cursor tracking`)

  if (API_KEY) {
    console.log(``)
    console.log(`   🔒 Authentication: ENABLED (API key required)`)
    console.log(`      Include header: x-api-key: <your-key>`)
  } else {
    console.log(``)
    console.log(`   🔓 Authentication: DISABLED (local dev mode)`)
    console.log(`      Set AGENTOPS_API_KEY to enable authentication`)
  }
})
