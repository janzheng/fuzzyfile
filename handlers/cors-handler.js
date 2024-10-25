


export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-custom-auth-key",
}


// Check requests for a pre-shared secret
export const hasValidHeader = (request) => {
  // not necessary until adding POST / PUT / DELETE
  // wrangler secret put AUTH_KEY_SECRET (specific to worker)
  return true 
  // return request.headers.get('X-Custom-Auth-Key') === AUTH_KEY_SECRET;
};



// const ALLOW_LIST = ['cat-pic.jpg'];
export function authorizeRequest(request, key) {
  switch (request.method) {
    case 'OPTIONS':
      return true; // pass to options handler
    case 'POST':
      return hasValidHeader(request);
    case 'PUT':
      return hasValidHeader(request);
    case 'DELETE':
      return hasValidHeader(XMLHttpRequestUpload);
    case 'GET':
      return true
    // return ALLOW_LIST.includes(key);
    default:
      return false;
  }
}


export function handleOptions(request) {
  if (request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null) {
    // Handle CORS pre-flight request.
    console.log('Handling CORS')
    return new Response(null, {
      headers: corsHeaders
    })
  } else {
    // Handle standard OPTIONS request.
    return new Response('null', {
      // headers: {
      //   "Allow": "GET, HEAD, POST, PUT, OPTIONS",
      // }
      headers: corsHeaders
    })
  }
}

