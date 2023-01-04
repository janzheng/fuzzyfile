

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-custom-auth-key",
}

function handleOptions(request) {
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





addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

function downloadFileBuf(url) {
  console.log('downloading:', url)
  try {
    return fetch(url)
      .then(x => x.arrayBuffer())
  } catch (e) {
    console.error('[downloadFileBuf] error:', e)
    return
  }
}


// Check requests for a pre-shared secret
const hasValidHeader = (request) => {
  // wrangler secret put AUTH_KEY_SECRET (specific to worker)
  return request.headers.get('X-Custom-Auth-Key') === AUTH_KEY_SECRET;
};

// const ALLOW_LIST = ['cat-pic.jpg'];

function authorizeRequest(request, key) {
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





/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  let key = url.pathname.slice(1);
  const { searchParams } = new URL(request.url)

  if (!authorizeRequest(request, key)) {
    return new Response('Forbidden', { status: 403 });
  }



  switch (request.method) {

    case 'OPTIONS':
      return handleOptions(request)

    case 'POST':

      // upload by URL
      if (request.headers.get('content-type') == "application/json") {
        let data = await request.json()
        // download from external url and put on R2
        if (data && data.type == 'external') {
          const {link, key, skip} = data
  
          // if exists, return true
          if (skip) {
            const object = await BUCKET.get(key);
            if(object)
              return new Response(`${key} exists; skipped!`);
          }
  
          let arrBuf = await downloadFileBuf(link)
          await BUCKET.put(key, arrBuf);
          return new Response(`POSTed ${key} successfully!`, {
            headers: corsHeaders
          });
        }
      }

      return new Response(JSON.stringify(`POST with a more specific request`), {
        headers: corsHeaders
      });



    case 'PUT':
      if(key) {
        console.log('putting:', key)
        key = encodeURIComponent(key)
        // need a file name "key", e.g. pd-r2-app.dev/file-name-here.png
        await BUCKET.put(key, request.body);
        return new Response(`Put ${key} successfully!`, {
          headers: corsHeaders
        });
      }
      return new Response(`Need a file name!`, {
        status: 500,
        headers: corsHeaders
      });
    
      
    case 'GET':
      let object
      let url = searchParams.get('url')
      let keyurl = "https://" + key.substring(7)// pathname does weird things with double // s
      
      if(key.includes("dl.airtable")) { 
        // handle situations like: — in these cases, they key is an entire URL
        // https://dl.phage.directory/https://dl.airtable.com/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
        // - the key needs to be everything after .attachments/
        // if airtable:
        //   if file exists, send back response from R2

        // airtable has these kinds of URLs:
        // https://dl.airtable.com/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
        // https://dl.airtable.com/guQYoqSQhaQ3K7kTau2w_full_ESKAPE%20Tshirt%20Christmas.JPG
        // https://dl.airtable.com/.attachmentThumbnails/abe7e69d4aee2659455fb88d3e2ea714/c8ff240c
        if(keyurl.includes('.attachments'))
          key = keyurl.substring(39)
        else if (keyurl.includes('.attachmentThumbnails'))
          key = keyurl.substring(48)
        else  
           key = keyurl.substring(24)

        console.log('[dl.airtable] accessing key/url:', key, keyurl)
        object = await BUCKET.get(key);
        if(object) {
          console.log('[dl.airtable] >>> object already exists:', keyurl, key)
        } else {
          // if not:
          //   upload from airtable, and grab the object
          let arrBuf = await downloadFileBuf(keyurl)
          await BUCKET.put(key, arrBuf);
          console.log('[dl.airtable] >>> object uploaded at', key, object)
        }
      } else if(key.includes(".attachments/")) {
        // covers scenario: https://dl.phage.directory/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
        // some airtable URLs have .attachments and some don't and it's unclear which will resolve
        // uploaded Airtable files do NOT have .attachments. so we try to get the object here
        key = keyurl.substring(14)
        object = await BUCKET.get(key);
      } else if(key == 'list') {
        // list the results
        let item = await BUCKET.list()
        let objects = item.objects.map(o => o.key)

        while (item.truncated) {
          item = await BUCKET.list({ cursor: item.cursor })
          objects = objects.concat(item.objects.map(o => o.key))

          console.log('object count:', item.length, item.truncated)
        }
        return new Response(JSON.stringify(objects));
      } else if (url) {
        // given a ?url=https://..... — upload this url to bucket
        let upkey = encodeURIComponent(url.substring(url.lastIndexOf('/') + 1))
        // console.log('adding:', upkey, url)
        let arrBuf = await downloadFileBuf(url)
        await BUCKET.put(upkey, arrBuf);
        return new Response(`Added ${upkey} successfully! Access image at: [https://dl.phage.directory/${upkey}] — url added: ${url}`);
      }
      
      if(!object)
        object = await BUCKET.get(key);


      // last hope check... this gets some random key and guesses at a few Airtable combinations. If there's a hit, we save and serve it
      // check if we can fetch it from Airtable; possible an airtable URL w/o having been uploaded
      if (object === null) {
        // console.log('...trying key: ', 'https://dl.airtable.com/' + key)
        let arrBuf = await downloadFileBuf('https://dl.airtable.com/' + key)
        // '886' is the size of the Airtable error page, so we skip that
        if (!arrBuf || arrBuf.byteLength == 886) {
          arrBuf = await downloadFileBuf('https://dl.airtable.com/.attachments/' + key)
          // console.log('...trying 2: ', 'https://dl.airtable.com/.attachments/' + key)
        }
        if (!arrBuf || arrBuf.byteLength == 886) {
          arrBuf = await downloadFileBuf('https://dl.airtable.com/.attachmentThumbnails/' + key)
          // console.log('...trying 3: ', 'https://dl.airtable.com/.attachmentThumbnails/' + key)
        }
        // console.log('arrb:', arrBuf.byteLength)
        if (arrBuf && arrBuf.byteLength !== 886) {
          await BUCKET.put(key, arrBuf);
          object = await BUCKET.get(key);
        }
      }

      if (object === null) {
        return new Response(`Object Not Found at ${key}`, { status: 404 });
      }

      // console.log('Bucket object:', object, object.GetResult)

      const headersObj = {
        'cache-control': 'public, max-age=86400',
      }

      if(key.includes('.svg')) { // dumb but works
        headersObj['content-type'] = 'image/svg+xml'
      }

      const headers = new Headers(headersObj);
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      return new Response(object.body, {
        headers,
      });

    case 'DELETE':
      await BUCKET.delete(key);
      return new Response('Deleted!');

    default:
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'PUT, GET, DELETE',
        },
      });
  }


  // return new Response('Hello worker!', {
  //   headers: { 'content-type': 'text/plain' },
  // })
}
