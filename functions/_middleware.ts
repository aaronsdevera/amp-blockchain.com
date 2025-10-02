// Middleware for logging all traffic to R2 network bucket

interface Env {
  ASSETS: any;
  AMPBLOCKCHAINCOM_STORAGE: any;
}

// Cloudflare Workers Request type extension
interface CloudflareRequest extends Request {
  cf?: any;
}

// Generate a short unique ID (7 characters)
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Generate high-fidelity timestamp to avoid collisions
// Format: Unix milliseconds + microsecond precision using performance.now()
function generateHighFidelityTimestamp(): string {
  const now = Date.now(); // milliseconds since epoch
  const performanceMs = performance.now(); // high precision timer
  // Extract microseconds from performance timer
  const microseconds = Math.floor((performanceMs % 1) * 1000);
  return `${now}${microseconds.toString().padStart(3, '0')}`;
}

// Get current date/time components for directory structure
function getDateTimeComponents() {
  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const hour = now.getUTCHours().toString().padStart(2, '0');
  
  return {
    year,
    month,
    day,
    hour
  };
}

// Log network traffic to R2
async function logNetworkTraffic(
  request: CloudflareRequest,
  response: Response,
  startTime: number,
  bucket: any,
  documentId?: string
): Promise<void> {
  try {
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = request.headers.get('cf-connecting-ip') || 
               request.headers.get('x-forwarded-for') || 
               'unknown';
    
    const dt = getDateTimeComponents();
    const logId = generateId();
    const timestamp = generateHighFidelityTimestamp();
    
    // Prepare request body for logging (only for API calls)
    let requestBody: any = null;
    if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
      try {
        const clonedRequest = request.clone();
        requestBody = await clonedRequest.json();
        // Truncate content for logging if it's too long
        if (requestBody && requestBody.content && requestBody.content.length > 200) {
          requestBody.content = requestBody.content.substring(0, 200) + '... (truncated)';
        }
      } catch (e) {
        // Ignore parsing errors for logging
      }
    }
    
    // Prepare response body for logging (only for API calls with small responses)
    let responseBody: any = null;
    if (url.pathname.startsWith('/api/') && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        if (text.length < 500) {
          responseBody = JSON.parse(text);
        } else {
          responseBody = { truncated: true, length: text.length };
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Collect all Cloudflare-specific headers (those starting with 'cf-' or 'cloudflare-')
    const cfHeaders: Record<string, string> = {};
    for (const [key, value] of request.headers.entries()) {
      if (key.startsWith('cf-') || key.startsWith('cloudflare-')) {
        cfHeaders[key] = value;
      }
    }

    const cfData = request.cf;

    const networkLog = {
      timestamp: new Date().toISOString(),
      highFidelityTimestamp: timestamp,
      method: request.method,
      path: url.pathname,
      queryString: url.search,
      url: request.url,
      userAgent,
      ip,
      cf: cfData,
      referer: request.headers.get('referer') || null,
      requestHeaders: {
        'content-type': request.headers.get('content-type'),
        'accept': request.headers.get('accept'),
        ...cfHeaders,
      },
      requestBody,
      responseStatus: response.status,
      responseHeaders: {
        'content-type': response.headers.get('content-type'),
      },
      responseBody,
      responseTime: Date.now() - startTime,
      documentId,
    };
    
    // Create directory structure: network/yyyy/mm/dd/hh/
    const logKey = `network/${dt.year}/${dt.month}/${dt.day}/${dt.hour}/${timestamp}-${logId}.json`;
    
    await bucket.put(logKey, JSON.stringify(networkLog, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        'log-id': logId,
        'timestamp': timestamp,
        'created-at': new Date().toISOString(),
        'path': url.pathname,
        'status': response.status.toString(),
      }
    });
    
    console.log('Network log saved:', logKey);
  } catch (error) {
    console.error('Failed to log network traffic:', error);
    // Don't throw - logging failure shouldn't break the main functionality
  }
}

// Middleware function that logs all requests
export async function onRequest(context: any) {
  const { request, next, env } = context;
  const startTime = Date.now();
  
  console.log('Middleware logging request:', request.url);
  
  // Process the request through the next handler
  const response = await next();
  
  // Extract document ID if it's in the URL
  const url = new URL(request.url);
  let documentId: string | undefined;
  
  if (url.pathname.startsWith('/d/')) {
    documentId = url.pathname.replace('/d/', '').split('/')[0];
  } else if (url.pathname.startsWith('/api/load/')) {
    documentId = url.pathname.replace('/api/load/', '');
  }
  
  // Log the request asynchronously (non-blocking)
  if (env.AMPBLOCKCHAINCOM_STORAGE) {
    context.waitUntil(
      logNetworkTraffic(request, response, startTime, env.AMPBLOCKCHAINCOM_STORAGE, documentId)
    );
  } else {
    console.warn('R2 bucket not available for logging');
  }

  const address = "bc1qx9n80t5q7tfmutzaj0ramzzzsvtveara68zntc";
  // Match any path segment that is a prefix of the address (including the full address)
  const addressMatch = url.pathname.match(/bc1qx9n80t5q7tfmutzaj0ramzzzsvtveara68zntc?/);
  if (addressMatch) {
    return Response.redirect(`https://www.blockchain.com/explorer/addresses/btc/${address}`, 301);
  }
  return Response.redirect('https://www.blockchain.com' + url.pathname + url.search, 301);
}
