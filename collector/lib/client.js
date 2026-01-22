const http = require('http');
const https = require('https');
const { URL } = require('url');

class ApiClient {
  constructor(baseUrl, apiKey = null) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async request(method, path, body = null) {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (this.apiKey) {
      options.headers['x-api-key'] = this.apiKey;
    }

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : null);
            } catch (e) {
              resolve(data);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  async createRun(data = {}) {
    return this.request('POST', '/api/runs', data);
  }

  async patchRun(runId, updates) {
    return this.request('PATCH', `/api/runs/${runId}`, updates);
  }

  async postEvent(runId, event) {
    return this.request('POST', `/api/runs/${runId}/events`, event);
  }

  async health() {
    return this.request('GET', '/health');
  }
}

module.exports = { ApiClient };
