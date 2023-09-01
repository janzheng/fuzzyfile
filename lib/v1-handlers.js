

import { downloadFileBuf, handleSearchParams, handleAddFile, handleGetFile, handleListFile, handleDownloadFile, handleHashDownload } from './helpers.js'
import { corsHeaders } from './cors-handler.js'
import { handleAirtable } from './airtable-handlers.js'
import { getPresignedUrl } from './presign-handler.js'



export const getHandler = async (request, BUCKET) => {
  // const { searchParams } = new URL(request.url)
  // let object
  // let url = searchParams.get('url')
  // let keyurl = "https://" + key.substring(7)// pathname does weird things with double // s


  // skip favicon requests since they throw errors and are generally dumb
  let url = new URL(request.url)
  if (url.pathname.includes("/favicon.ico") && url.pathname?.split('/').length == 2) {
    return new Response('favicon.ico', { status: 200 })
  }


  let airtableRes = await handleAirtable(request.url, BUCKET)
  if (airtableRes) {
    // returns an image, if handling an Airtable attachment
    return airtableRes
  }

  let config = await handleSearchParams(request.url, BUCKET)

  console.log('[getHandler][paramObj]', config)

  if (config && config?.cmd == 'add') {
    if(config.returnFile) {
      let res = await handleAddFile(config, BUCKET)
      console.log('return returnFile')
      return res
    } else {
      let json = await handleAddFile(config, BUCKET)
      return new Response(JSON.stringify(json), {
        headers: corsHeaders
      })
    }
  } else if (config && config?.cmd == 'get') {
    let res = await handleGetFile(config, BUCKET)
    // return new Response(JSON.stringify(res))
    return res
  } else if (config && config?.cmd == 'list') {
    // list items here
    let json = await handleListFile(config, BUCKET)
    return new Response(JSON.stringify(json), {
      headers: corsHeaders
    })
  } else if (config && config?.cmd == 'download') {
    // downloads ALL files found using prefix within the pathname, by zipping them up and returning the zip file
    let res = await handleDownloadFile(config, BUCKET)
    return res
  } else if (config && config?.cmd == 'hash') {
    // searches + downloads file via ipfs hash
    let res = await handleHashDownload(config, BUCKET)
    return res
  }
    
  return new Response('Something went wrong with your request')
}




export const postHandler = async (request) => {
  // upload by URL
  if (request.headers.get('content-type') == "application/json") {
    // console.log('request text?!', await request.text())
    let config = await request.json()

    console.log('[postHandler] config:', config)

    // copy + paste from Get handler — pass in the config exactly the same
    // use multipart form data to actually add files
    if (config && config?.cmd == 'add') {
      if (config.returnFile) {
        let res = await handleAddFile(config, BUCKET)
        return res
        
      } else {
        let json = await handleAddFile(config, BUCKET)
        return new Response(JSON.stringify(json), {
          headers: corsHeaders
        })
      }
    } else if (config && config?.cmd == 'get') {
      let res = await handleGetFile(config, BUCKET)
      return res
    } else if (config && config?.cmd == 'list') {
      // list items here
      let json = await handleListFile(config, BUCKET)
      return new Response(JSON.stringify(json), {
        headers: corsHeaders
      })
    } else if (config && config?.cmd == 'download') {
      // downloads ALL files found using prefix within the pathname, by zipping them up and returning the zip file
      let res = await handleDownloadFile(config, BUCKET)
      return res
    } else if (config && config?.cmd == 'hash') {
      // searches + downloads file via ipfs hash
      let res = await handleHashDownload(config, BUCKET)
      return res
    } else if (config && (config?.cmd == 'presigned' || config?.cmd == 'presign')) {
      // get presigned url
      let res = await getPresignedUrl(config)
      return new Response(res, {
        headers: corsHeaders
      })
    } else if (config && config?.cmd) {
      return new Response(JSON.stringify({status: 'Command “' + config.cmd + '” not implemented'}), {
        headers: corsHeaders
      })
    }
    
  } 
  

  // upload files w/ form data
  else if (request.headers.get('content-type').includes("multipart/form-data")) {

    const formData = await request.formData()
    let files = formData.getAll('files')
    let jsons = []
    // add each file separately
    let filePath = formData.get('filePath')

    let scope = formData.get('scope')
    let nanoid = formData.get('nanoid') // only works for a single file
    let useVersioning = true
    if (formData.get('versioning') == 'false')
      useVersioning = false
    
    if (filePath) {
      if (filePath.startsWith('/')) {
        filePath = filePath.substring(1)
      } else if (filePath.startsWith('./')) {
        filePath = filePath.substring(2)
      }

      // remove the filename from filepath
      let filePathArr = filePath.split('/')
      // remove the last item
      filePathArr.pop()
      filePath = filePathArr.join('/')
      if (filePath?.endsWith('/'))
        filePath = filePath.slice(0, -1)
      nanoid = '' // this prevents id from generating for custom paths
      scope += "/" + filePath
      useVersioning = false // really annoying when it adds versions to strict file paths
    }

    await Promise.all(files.map(async file => {
      console.log('[files] adding file:', file.name, file.type, file.size)
      const config = {
        cmd: 'add',
        key: file.name,
        scope,
        nanoid,
        useVersioning,
      }
      let fileData = await file.arrayBuffer()
      console.log('[postHandler] uploading form data:', config)
      let json = await handleAddFile(config, BUCKET, fileData)
      jsons.push(json)
    }))

    console.log('[postHandler] Form upload done; response:', JSON.stringify(jsons))

    return new Response(JSON.stringify(jsons), {
      headers: corsHeaders
    })
    // return summary of all files added
  }
  else {
    // unhandled
  }

  return new Response(JSON.stringify(`POST with a more specific request`));
}



// DEPRECATED — USE POST INSTEAd
// this is called server-side, e.g. from instll as a PUT cmd
// ${PUBLIC_PDR2_ENDPOINT}/some/path/${filename}
export const putHandler = async (request) => {
  let url = new URL(request.url)
  let pathname = url.pathname.slice(1);
  let pathArr = pathname.split('/')
  // filter pathArr
  pathArr = pathArr.filter(item => item)
  console.log('--> pathArr', pathArr)
  let filename = pathArr[pathArr.length - 1]
  let scope = pathArr.slice(0, pathArr.length - 1).join('/')
  if (pathname) {
    // let fileData = await request.body.arrayBuffer()
    const config = {
      cmd: 'add',
      key: filename,
      scope
    }
    let json = await handleAddFile(config, BUCKET, request.body)
    return new Response(JSON.stringify(json), {
      headers: corsHeaders
    })
  }
  return new Response(`Need a file name!`, {
    status: 500,
    headers: corsHeaders
    });
  // return new Response('Not implemented!');
}

export const deleteHandler = async (request, key) => {
//   await BUCKET.delete(key);
//   return new Response('Deleted!');
  return new Response('Not implemented!');
}


























export const getHandlerOld = async (request, key) => {
  const { searchParams } = new URL(request.url)
  let object
  let url = searchParams.get('url')
  let keyurl = "https://" + key.substring(7)// pathname does weird things with double // s

  if (key.includes("dl.airtable")) {
    // handle situations like: — in these cases, they key is an entire URL
    // https://dl.phage.directory/https://dl.airtable.com/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
    // - the key needs to be everything after .attachments/
    // if airtable:
    //   if file exists, send back response from R2

    // airtable has these kinds of URLs:
    // https://dl.airtable.com/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
    // https://dl.airtable.com/guQYoqSQhaQ3K7kTau2w_full_ESKAPE%20Tshirt%20Christmas.JPG
    // https://dl.airtable.com/.attachmentThumbnails/abe7e69d4aee2659455fb88d3e2ea714/c8ff240c
    if (keyurl.includes('.attachments'))
      key = keyurl.substring(39)
    else if (keyurl.includes('.attachmentThumbnails'))
      key = keyurl.substring(48)
    else
      key = keyurl.substring(24)

    console.log('[dl.airtable] accessing key/url:', key, keyurl)
    object = await BUCKET.get(key);
    if (object) {
      console.log('[dl.airtable] >>> object already exists:', keyurl, key)
    } else {
      // if not:
      //   upload from airtable, and grab the object
      let arrBuf = await downloadFileBuf(keyurl)
      await BUCKET.put(key, arrBuf);
      console.log('[dl.airtable] >>> object uploaded at', key, object)
    }
  } else if (key.includes(".attachments/")) {
    // covers scenario: https://dl.phage.directory/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
    // some airtable URLs have .attachments and some don't and it's unclear which will resolve
    // uploaded Airtable files do NOT have .attachments. so we try to get the object here
    key = keyurl.substring(14)
    object = await BUCKET.get(key);
  } else if (key == 'list') {
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

  if (!object)
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

  if (key.includes('.svg')) { // dumb but works
    headersObj['content-type'] = 'image/svg+xml'
  }

  const headers = new Headers(headersObj);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, {
    headers,
  });
}