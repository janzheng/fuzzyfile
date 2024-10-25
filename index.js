
import { handleOptions, authorizeRequest } from './handlers/cors-handler.js'
// import { postHandler, deleteHandler, putHandler } from './lib/v1-handlers.js'
import { getHandler } from './handlers/get-handler.js'
import { postHandler } from './handlers/post-handler.js'


addEventListener('fetch', (event, env) => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request, env) {
  const url = new URL(request.url);
  let key = url.pathname.slice(1);

  if (!authorizeRequest(request, key)) {
    return new Response('Forbidden', { status: 403 });
  }

  switch (request.method) {

    case 'OPTIONS':
      return handleOptions(request);
      
    case 'POST':
      return await postHandler(request, BUCKET);

    // case 'PUT':
    //   return await putHandler(request, key);

    case 'GET':
      return getHandler(request, BUCKET);

    // case 'DELETE':
    //   return await deleteHandler(request, key);

    default:
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'PUT, GET, DELETE',
        },
      });
  }

}

