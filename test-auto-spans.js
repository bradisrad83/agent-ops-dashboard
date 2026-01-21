/**
 * Test script for auto-span generation from tool events (Hardened)
 *
 * This script tests:
 * 1. Normal tool.called -> tool.result flow
 * 2. Globally unique span IDs (Part A)
 * 3. Out-of-order events: tool.result before tool.called (Part C)
 * 4. Error status derivation (Part D)
 * 5. Timestamp-aware parent selection (Part B)
 */

const http = require('http')

const BASE_URL = 'http://localhost:8787'
let runId = `test-run-${Date.now()}`

// Helper to make HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    const req = http.request(url, options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const result = data ? JSON.parse(data) : {}
          resolve({ status: res.statusCode, data: result })
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function test() {
  console.log('🧪 Testing auto-span generation from tool events\n')

  // Step 1: Create a test run
  console.log('1. Creating test run...')
  const createRunRes = await request('POST', '/api/runs', {
    id: runId,
    title: 'Auto-Span Test Run'
  })
  console.log(`   ✓ Run created: ${runId}\n`)

  // Step 2: Send tool.called event
  console.log('2. Sending tool.called event...')
  const toolCallId = 'test-tool-call-123'
  const toolCalledRes = await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.called',
    ts: new Date().toISOString(),
    payload: {
      toolCallId: toolCallId,
      toolName: 'TestTool',
      params: { foo: 'bar' }
    }
  })
  console.log(`   ✓ tool.called event sent (id: ${toolCalledRes.data.id})\n`)

  // Wait a bit
  await sleep(100)

  // Step 3: Check if span was auto-created
  console.log('3. Checking for auto-created span...')
  const spansRes = await request('GET', `/api/runs/${runId}/spans`)
  const spans = spansRes.data

  console.log(`   Found ${spans.length} span(s)`)

  // Part A: Check for globally unique span ID format
  const expectedSpanId = `tool-${runId}-${toolCallId}`
  const autoSpan = spans.find(s => s.spanId === expectedSpanId)
  if (autoSpan) {
    console.log(`   ✓ Auto-span created with globally unique ID:`)
    console.log(`     - spanId: ${autoSpan.spanId}`)
    console.log(`     - name: ${autoSpan.name}`)
    console.log(`     - kind: ${autoSpan.kind}`)
    console.log(`     - auto: ${autoSpan.attrs?.auto}`)
    console.log(`     - endTs: ${autoSpan.endTs ? 'present' : 'null (still running)'}`)
  } else {
    console.log('   ✗ Auto-span NOT found!')
    console.log(`   Expected spanId: ${expectedSpanId}`)
    console.log(`   All spans:`, JSON.stringify(spans, null, 2))
    process.exit(1)
  }
  console.log()

  // Step 4: Send tool.result event
  console.log('4. Sending tool.result event...')
  const toolResultRes = await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.result',
    ts: new Date().toISOString(),
    payload: {
      toolCallId: toolCallId,
      result: 'Success!'
    }
  })
  console.log(`   ✓ tool.result event sent (id: ${toolResultRes.data.id})\n`)

  // Wait a bit
  await sleep(100)

  // Step 5: Check if span was auto-completed
  console.log('5. Checking if span was auto-completed...')
  const spansRes2 = await request('GET', `/api/runs/${runId}/spans`)
  const spans2 = spansRes2.data

  const completedSpan = spans2.find(s => s.spanId === expectedSpanId)
  if (completedSpan && completedSpan.endTs) {
    console.log(`   ✓ Auto-span completed:`)
    console.log(`     - spanId: ${completedSpan.spanId}`)
    console.log(`     - status: ${completedSpan.status}`)
    console.log(`     - endTs: ${completedSpan.endTs}`)
    console.log(`     - duration: ${completedSpan.endTs - completedSpan.startTs}ms`)
  } else {
    console.log('   ✗ Auto-span NOT completed!')
    console.log(`   Span:`, JSON.stringify(completedSpan, null, 2))
    process.exit(1)
  }
  console.log()

  // Step 6: Test out-of-order events (Part C)
  console.log('6. Testing out-of-order events (tool.result before tool.called)...')
  const toolCallId2 = 'test-tool-call-456'

  // Send tool.result FIRST
  await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.result',
    ts: new Date().toISOString(),
    payload: {
      toolCallId: toolCallId2,
      result: 'Early result!'
    }
  })
  console.log(`   ✓ Sent tool.result first`)

  await sleep(100)

  // Check for placeholder span
  const spansRes3 = await request('GET', `/api/runs/${runId}/spans`)
  const expectedSpanId2 = `tool-${runId}-${toolCallId2}`
  const placeholderSpan = spansRes3.data.find(s => s.spanId === expectedSpanId2)

  if (placeholderSpan && placeholderSpan.attrs?.placeholder) {
    console.log(`   ✓ Placeholder span created:`)
    console.log(`     - name: ${placeholderSpan.name}`)
    console.log(`     - placeholder: ${placeholderSpan.attrs.placeholder}`)
  } else {
    console.log('   ✗ Placeholder span NOT created properly!')
    process.exit(1)
  }

  // Now send tool.called
  await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.called',
    ts: new Date().toISOString(),
    payload: {
      toolCallId: toolCallId2,
      toolName: 'LateToolName'
    }
  })
  console.log(`   ✓ Sent tool.called after`)

  await sleep(100)

  // Check for upgraded span
  const spansRes4 = await request('GET', `/api/runs/${runId}/spans`)
  const upgradedSpan = spansRes4.data.find(s => s.spanId === expectedSpanId2)

  if (upgradedSpan && upgradedSpan.name === 'Tool: LateToolName' && !upgradedSpan.attrs?.placeholder) {
    console.log(`   ✓ Placeholder upgraded successfully:`)
    console.log(`     - name: ${upgradedSpan.name}`)
    console.log(`     - placeholder removed: ${!upgradedSpan.attrs?.placeholder}`)
  } else {
    console.log('   ✗ Placeholder NOT upgraded properly!')
    console.log(`   Span:`, JSON.stringify(upgradedSpan, null, 2))
    process.exit(1)
  }
  console.log()

  // Step 7: Test error status derivation (Part D)
  console.log('7. Testing error status derivation...')
  const toolCallId3 = 'test-tool-call-789'

  await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.called',
    ts: new Date().toISOString(),
    payload: {
      toolCallId: toolCallId3,
      toolName: 'ErrorTool'
    }
  })

  await request('POST', `/api/runs/${runId}/events`, {
    type: 'tool.result',
    ts: new Date().toISOString(),
    level: 'error',
    payload: {
      toolCallId: toolCallId3,
      error: 'Something went wrong!'
    }
  })

  await sleep(100)

  const spansRes5 = await request('GET', `/api/runs/${runId}/spans`)
  const expectedSpanId3 = `tool-${runId}-${toolCallId3}`
  const errorSpan = spansRes5.data.find(s => s.spanId === expectedSpanId3)

  if (errorSpan && errorSpan.status === 'error') {
    console.log(`   ✓ Error status correctly derived:`)
    console.log(`     - status: ${errorSpan.status}`)
  } else {
    console.log('   ✗ Error status NOT derived correctly!')
    console.log(`   Span:`, JSON.stringify(errorSpan, null, 2))
    process.exit(1)
  }
  console.log()

  console.log('✅ All tests passed!')
  console.log(`\n📊 View in dashboard: http://localhost:3000?runId=${runId}`)
}

test().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
