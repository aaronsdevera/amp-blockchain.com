
// Middleware function that logs all requests
export async function onRequest(context: any) {
    const { request, next, env } = context;
    const startTime = Date.now();
    
    console.log('Middleware logging request:', request.url);
    
    // Process the request through the next handler
    const response = await next();
    
    // Extract document ID if it's in the URL
    const url = new URL(request.url);
  
  
  
    const address = "bc1qx9n80t5q7tfmutzaj0ramzzzsvtveara68zntc";
    // Match any path segment that is a prefix of the address (including the full address)
    const addressMatch = url.pathname.match(/bc1qx9n80t5q7tfmutzaj0ramzzzsvtveara68zntc?/);
  
    // if the direct hostname in the pathname (no uri), just go to homepage
    if (url.hostname === 'amp-blockchain.com' && url.pathname === '/') {
      return Response.redirect('https://www.blockchain.com', 301);
    }
    else if (url.pathname.includes('bc1qx9n8')) {
      return Response.redirect(`https://www.blockchain.com/explorer/addresses/btc/${address}`, 301);
    }
    else if (addressMatch) {
      return Response.redirect(`https://www.blockchain.com/explorer/addresses/btc/${address}`, 301);
    }
    return Response.redirect('https://www.blockchain.com' + url.pathname + url.search, 301);
  }
  