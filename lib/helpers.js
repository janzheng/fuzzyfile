import JSZip from 'JSZip'
import { nanoid } from 'nanoid'
import { corsHeaders } from './cors-handler.js'
import { dataHash } from './file-helpers.js'

export let baseUrl = 'https://f2.phage.directory'


export function downloadFileBuf(url) {
  console.log('[downloadFileBuf] downloading:', url)
  try {
    return fetch(url,
      {headers: { 'User-Agent': 'Mozilla/5.0' }})
      .then(x => x.arrayBuffer())
  } catch (e) {
    console.error('[downloadFileBuf] error:', e)
    return
  }
}


/* 

  for handling GET parameters

  - returns an obj w/ cmd, scope, key, and url
  - if scope is missing, it's considered "global" and uses direct file access

  URL cases:
  - f2.phage.directory/filename.jpg 
  - f2.phage.directory/yawnxyz (list files?, or post only?)
  - f2.phage.directory/yawnxyz/123abc
  - f2.phage.directory/yawnxyz/123abc/filename.jpg

  - f2.phage.directory/?add=https://upload.wikimedia.org/wikipedia/commons/7/74/A-Cat.jpg&name=tabbycat.jpg
  - f2.phage.directory/yawnxyz/?add=https://example.com/filename.jpg&name=newfilename.jpg
  - f2.phage.directory/yawnxyz/123abc/?add=https://example.com/filename.jpg&name=newfilename.jpg
    - "standard" uploads have pathArr of len 3

  - f2.phage.directory/yawnxyz/arbitrary/deep/folder/structure?add=https://example.com/filename.jpg
    - for arbitrary deep folders ()


*/
export async function handleSearchParams(url, BUCKET) {
  try { 
    const { searchParams } = new URL(url)
    let { pathname } = new URL(url)
    let add = searchParams.get('add')
    let urlParam = searchParams.get('url')
    let name = searchParams.get('name')
    let download = searchParams.get('download')
    // let optionStr
    let pathArr = pathname?.split('/')

    // remove trailing slash from pathname
    if (pathname?.endsWith('/'))
      pathname = pathname.slice(0, -1)

    console.log('PATHNAME:', pathname, pathArr, 'pathArr len:', pathArr?.length)

    let src = add || urlParam
    if(pathArr[1] == 'download') {
      // downloads ALL files found using prefix within the pathname, by zipping them up and returning the zip file
      let scope = pathArr?.slice(2)?.join('/')

      if (pathname?.endsWith('/'))
        pathname = pathname.slice(0, -1)
        
      return {
        cmd: 'download',
        scope,
      }
    }
    else if (pathArr?.[1] == 'list' && pathArr.length == 2) {
      // matches /list — this will list all namepaces
      return {
        cmd: 'list',
        scope: '',
      }
    } 
    else if (pathArr[1] == 'hash') {
      // matches paths like /hash/Qma5zM3diAxAegs3FJWhU52k5h3sX7iB6hS7PRTzWVJZ9Q
      // these hashes are unique to the file
      let scope = pathArr?.slice(2)?.join('/')

      if (pathname?.endsWith('/'))
        pathname = pathname.slice(0, -1)

      return {
        cmd: 'hash',
        hash: scope,
      }
    }
    else if (src) {
      // if ?add or ?url  is present, we're adding a file
      // let key equal to the file name of the given url
      // if name is present, use that as the key

      pathname = pathname.slice(1) // remove starting slash
      let nanoid = pathArr.length <= 4 ? pathArr?.[2] : undefined

      if(nanoid == '') // if nanoid is empty, we clear it so we can generate a new one later
        nanoid = undefined

      console.log('sigh', pathArr, nanoid)

      // check if the nanoid is valid for arbitrary deep folders
      if (pathArr?.length > 4) {
        const bucketList = await BUCKET.list({
          prefix: pathname
        });
        if (bucketList?.objects?.length > 0) {
          // if any of the objects have a versioned path pathname/v[0-9]/, we don't want to create a new nanoid
          bucketList.objects.find(x => {
            x = x.key.replace(pathname, '')
            let xKeyArr = x.split('/')
            let match = xKeyArr?.[1].match(/v[0-9]+/)
            if(match && match.length > 0) {
              console.log('found match:', match)
              nanoid = '' 
            }
          })
        }
      }

      let scope = pathArr.length <= 4 ? pathArr?.[1] : pathArr?.slice(1)?.join('/') || null // for arbitrary long ones, we just get the entire folder depth as the full scope
      if (scope?.endsWith('/'))
        scope = scope.slice(0, -1)

      // let optionStr = !pathArr?.[2] ? 'direct-upload' : undefined // if no nanoid, we treat this as a "direct upload"
      // the above is causing trouble for regular scope-based adds
      let optionStr // = !pathArr?.[2] ? 'direct-upload' : undefined // if no nanoid, we treat this as a "direct upload"

      // supports direct upload for any arbitrary deep paths
      if(urlParam) {
        scope = pathname
        optionStr = 'direct-upload'
        console.log('urlParam, so using full path:', pathname)
      }

      console.log('sending nanoid::', nanoid, typeof nanoid)
      return {
        cmd: 'add',
        key: name || (src?.split('/')?.[src?.split('/').length - 1]),
        url: src,
        returnFile: urlParam,
        scope, // for arbitrary long ones, we just get the entire folder depth as the full scope
        nanoid,
        pathname,
        optionStr,
      }
    } 
    
    
    // getters
    else {
      let key // used for direct files
      let scope, nanoid, filename, version, objects
      let cmd = 'get'

      // direct download from global file name
      // - f2.phage.directory / filename.jpg
      // - f2.phage.directory / yawnxyz
      if (pathArr.length == 2) {
        key = (pathArr?.[pathArr.length - 1]) // used for direct files
        const bucketList = await BUCKET.list({
          prefix: pathArr?.[1]
        });
        if (bucketList?.objects?.length > 0) {
          // given the pathname, we have a scope that matches a bucket
          scope = pathArr?.[1]
          objects = bucketList?.objects
          nanoid = ''
          console.log('[scope]:', scope, objects)
          // list files in scope if pathnames length is 2 (no nanoid)
          
          if (pathArr?.[1] == 'list' && pathArr.length == 2) {
            cmd = 'list' // list ALL files within the scope, e.g. /yawnxyz
          }

        } else {
          // download the file directly if no scope given
          key = pathArr?.[1]
        }
      } 

      // - f2.phage.directory / bunch/of/other/paths / filename.jpg
      else if (pathArr.length > 2) {
        console.log('BUNCHA PATHS')

        scope = pathArr.length < 3 ? pathArr?.[1] : pathArr?.slice(1)?.join('/').slice(0, -1)
        // scope = pathArr?.[1]
        // nanoid = pathArr?.[2]
        filename = pathArr?.[3]?.startsWith('v') ? pathArr?.[4] : pathArr?.[3] || null
        version = pathArr?.[3]?.startsWith('v') ? pathArr?.[3] : null

        // new:
        //    fits pattern: list/yawnxyz/arbitrary/path
        // old:
        //    fits pattern: yawnxyz/list/abc123/arbitrary/path
        //    the first is always treated as a "main" scope
        if (pathArr?.[1] == 'list') {
          cmd = 'list' // list the files within the version, e.g. yawnxyz/abc123/list
          scope = pathArr?.slice(2)?.join('/')
          nanoid = null

          // if (nanoid == 'list') {
          //   // set nanoid to pathname array 3rd item and beyond
          //   // set nanoid to the 3rd item and all items after, joined into a string
          //   nanoid = pathArr?.slice(3)?.join('/')
          //   // optionStr = 'simple'
          //   // nanoid = pathArr?.[3]
          // }
        } 
        // fits pattern: yawnxyz/abc123/list
        else if (pathname?.endsWith('/list')) {
          cmd = 'list' // list the files within the version, e.g. yawnxyz/abc123/list
          if(nanoid == 'list') {
            nanoid = null // reset nanoid variable since it MIGHt say 'list' here
            // this has the side effect of preventing a user from naming a nanoid 'list' but whatever lol
          }
        }

        else {
          // reset the key so it doesn't afect handleGetFile when not present
          pathname = pathname.slice(1) // remove starting slash
          key = ''
          nanoid = false
          scope = pathname
        }
      }
      
      return {
        cmd,
        key, // only used for direct uploading
        scope,
        objects,
        nanoid,
        filename,
        version,
        pathname,
        // optionStr,
      }
    }

  } catch (e) {
    console.error(`[handleSearchParams], error:`, e)
  }
}








export async function handleGetFile(config, BUCKET) {
  let key

  // get the direct download, if no nanoid is given
  if(typeof config.nanoid == undefined) {
    key = `${config.scope}${config.key ? `/${config.key}` : ''}`
  } 
  
  // for versioned, scoped files
  else {
  
    let scopeAndId = `${config.scope}/${config.nanoid}`

    if(config.nanoid == false) {
      // when set to 'false' this retrieves any latest file in the scope
      // and then attempts to match the version in the scope
      scopeAndId = `${config.scope}`
    }

    let bucketList = await BUCKET.list({
      prefix: scopeAndId,
      include: ['httpMetadata', 'customMetadata' ]
    })
    let objects = bucketList.objects
    objects.sort((a, b) => {
      return new Date(b.uploaded) - new Date(a.uploaded)
    })
  
    console.log('[handleGetFile] nanoid prefix:', scopeAndId, 'key:', config.key, 'nanoid:', config.nanoid, objects.length)
  
    // make sure to either get the latest version, or the version specified in the url
    let latestFile
    if (config.version) {
      latestFile = objects?.find(o => o.key?.includes(`/${config.version}/`))
    } else { 
      latestFile = objects?.[0]
    }
  
    console.log('latest file:', JSON.stringify(latestFile))
  
    if(!latestFile) { return new Response(`File not found at path`, { status: 404 }); }

    key = latestFile?.key;
  }


  console.log('[handleGetFile] key:', key)
  let fileObject = await BUCKET.get(key);

  if(!fileObject) {
    return new Response(`File not found at path`, { status: 404 });
  }

  const headersObj = {
    'cache-control': 'public, max-age=86400',
    'content-disposition': `inline ; filename="${fileObject.key}"`,
    // 'content-disposition': `attachment ; filename="${fileObject.key}"`,
    ...corsHeaders
  }

  if (fileObject?.httpMetadata?.contentType) {
    headersObj['content-type'] = fileObject?.httpMetadata?.contentType
  }

  const headers = new Headers(headersObj);
  fileObject?.writeHttpMetadata(headers);
  headers.set('etag', fileObject.httpEtag);

  return new Response(fileObject.body, {
    headers
  });
}





export async function handleDownloadFile(config, BUCKET) {
  console.log('[handleDownloadFile] config:', config)
  let prefix = `${config.scope}`

  let bucketList = await BUCKET.list({
    prefix,
    // include: ['httpMetadata']
  })
  let files = bucketList.objects.map(o => ({ key: o.key }))

  console.log('+++ files:', prefix, files.length)

  if(files.length == 0) {
    return new Response(`No files found at path`, { status: 404 });
  }

  while (bucketList.truncated) {
    bucketList = await BUCKET.list({ cursor: bucketList.cursor })
    files = objects.concat(bucketList.objects.map(o => ({ key: o.key })))
  }

  try {
    const zip = new JSZip();

    await Promise.all(files.map(async file => {
      let fileObject = await BUCKET.get(file.key);
      let fileName = file.key.split('/').pop()
      let arrayBuf = await fileObject.arrayBuffer()
      console.log('+++ adding:', file.key, arrayBuf.byteLength)
      await zip.file(file.key, arrayBuf, {binary: true});
    }))

    let zipBlob = await zip.generateAsync({ type: "blob" })
  
    const headersObj = {
      'content-type': 'application/zip',
      ...corsHeaders
    }
    const headers = new Headers(headersObj);
  
    return new Response(zipBlob, {
      headers
    });
  } catch(e) {
    console.log('Zip adding failed:', e)
    return new Response(`Error creating the zip file`, { status: 404 });
  }
}




export async function handleListFile(config, BUCKET) {
  // add a file based on scope, nanoid, and filename
  let prefix = config.nanoid ? `${config.scope}/${config.nanoid}/` : `${config.scope}` 

  console.log('[handleListFile] pathname:', config.pathname, '>>> prefix:', prefix)
  
  let bucketList = await BUCKET.list({
    prefix,
    include: ['httpMetadata', 'customMetadata']
  })
  let objects = bucketList.objects.map(o => ({ key: o.key, uploaded: o.uploaded, size: o.size, type: o.httpMetadata?.contentType, ipfsHash: o.customMetadata?.ipfsHash }))
  while (bucketList.truncated) {
    bucketList = await BUCKET.list({ cursor: bucketList.cursor })
    objects = objects.concat(bucketList.objects.map(o => ({ key: o.key, uploaded: o.uploaded, size: o.size, type: o.httpMetadata?.contentType, ipfsHash: o.customMetadata?.ipfsHash })))
    // objects = [...objects, ...bucketList.objects]
  }

  // sort objects by object.uploaded date, latest first
  objects.sort((a, b) => {
    return new Date(b.uploaded) - new Date(a.uploaded)
  })

  console.log('object len:', objects.length)

  // if no nanoid, we show all the nanoid namespaces, e.g. "yawnxyz"
  // and associated files
  if(config.scope == '') {
    let grouped = {}
    objects.map(o => {
      let id = o.key.split('/')[0]
      if(!grouped[id]) grouped[id] = []
      grouped[id].push(o)
    })
    let total = objects?.length
  
    return {
      total,
      items: grouped,
    }
  }

  // group by nanoid only if nanoid is actually a nanoid and not an arbitrary path (doesn't include "/")
  if(config.nanoid && !config.nanoid.includes('/')) {

    let grouped = {}
    objects.map(o => {
      let id = o.key.split('/')[1]
      if(!grouped[id]) grouped[id] = []
      grouped[id].push(o)
    })
    let total = objects?.length
  
    grouped = grouped[config.nanoid]
    total = grouped?.length
  
    return {
      items: grouped,
      total,
    }
  }

  // return all items in the bucket, since too difficult to group by nanoid
  return {
    total: objects.length,
    items: objects
  }
}







export async function handleAddFile(config, BUCKET, fileBuf) {
  // add a file based on scope, nanoid, and filename
  // let id = config.scope ? (config.nanoid || `ff-${nanoid(8)}`) : undefined
  let id = config.scope ? (config.nanoid || `${nanoid(8)}`) : undefined
  let scopeAndId = config.scope ? `${config.scope}/${id}/` : ''
  let ipfsHash
  
  if (config.nanoid == '') {// skip nanoid for deep paths
    console.log('>>> skipping nanoid')
    scopeAndId = config.scope ? `${config.scope}/` : ''
  }

  // check if this scope + id exists; if it does, increment the version
  let bucketList = await BUCKET.list({
    prefix: scopeAndId
  });

  let version = bucketList?.objects?.length > 0 ? `v${bucketList?.objects?.length}` : `v0`
  // let filename = config.key || nanoid(4) // generate a short fake name if none given
  let filename = config.key || (config.url?.split('/')?.[config.url?.split('/').length - 1]) // try to get file name from url
  let upkey = `${scopeAndId}${version ? `${version}/` : ''}${filename}`

  if (!config.nanoid) {// if we're not using nanoids, then we're also skipping versioning
    upkey = `${scopeAndId}${filename}`
    version = null
  }

  console.log('>>> init upkey:', upkey)

  if (config.useVersioning && config.useVersioning == false) {
    console.log('>>> skipping versioning')
    upkey = `${scopeAndId}${filename}`
  }

  if (bucketList?.objects?.length > 0)
    id = config.scope.split('/')[config.scope.split('/').length - 1]

  // if using "direct upload" mode we skip adding id and versioning
  if (config.optionStr == 'direct-upload') {
    console.log('>>> using direct upload')
    if (config.scope)
      upkey = `${config.scope}/${filename}`
    else
      upkey = `${filename}`
  }

  upkey = encodeURI(upkey) // get rid of symbols that might break the url
  
  console.log('[handleAddFile] Using key:', upkey, 'scopeAndId:', scopeAndId, 'nanoid:', config.nanoid)

  // check if this filename exists, and return it if it does
  // download file buffer and upload if it doesn't exist
  // return file immediately (fits pattern: /yawnxyz?url=https://file.com/file.png) - for pass-through
  if(config.returnFile) {

    let fileObject = await BUCKET.get(upkey);

    if(!fileObject) {
      if(!fileBuf)
        fileBuf = await downloadFileBuf(config.url)

      let fileUintarr = new Uint8Array(fileBuf)
      ipfsHash = await dataHash(fileUintarr)
      console.log('>>> ipfsHash:', ipfsHash)
      fileObject = await BUCKET.put(upkey, fileBuf, {
        customMetadata: {
          ipfsHash,
        }
      });
    }

    const headersObj = {
      'cache-control': 'public, max-age=86400',
      ...corsHeaders
    }

    const headers = new Headers(headersObj);
    fileObject?.writeHttpMetadata(headers);
    headers.set('etag', fileObject.httpEtag);

    // return new Response(fileBuf, {
    return new Response(fileObject.body, {
      headers
    });
  } 
  
  // 
  else {
    // upkey = `${scopeAndId}${version ? `${version}/` : ''}${filename}`
    if (!fileBuf)
      fileBuf = await downloadFileBuf(config.url)

    let fileUintarr = new Uint8Array(fileBuf)
    ipfsHash = await dataHash(fileUintarr)
    console.log('>>> ipfsHash:', ipfsHash)
    await BUCKET.put(upkey, fileBuf, {
      customMetadata: {
        ipfsHash,
      }
    });
  }

  return {
    key: upkey,
    scope: config.scope || undefined,
    id,
    version: version || undefined,
    origin: config.url,
    latest: `${baseUrl}/${scopeAndId}`,
    permalink: `${baseUrl}/${upkey}`,
    ipfsHash,
    message: `Added ${upkey} successfully!`
  }
}







export async function handleHashDownload(config, BUCKET) {
  console.log('[handleHashDownload] config:', config)

  let fileObject, fileKey
  let bucketList = await BUCKET.list({
    include: ['customMetadata']
  })
  let files = bucketList.objects.map(o => ({ key: o.key, ipfsHash: o.customMetadata?.ipfsHash }))

  // if we have a hash, find the file with that hash
  if (config.hash) {
    fileKey = files.find(f => f.ipfsHash == config.hash)?.key
  }


  while (bucketList.truncated && !fileKey) {
    bucketList = await BUCKET.list({ 
      cursor: bucketList.cursor,
      include: ['customMetadata']
    })

    files = objects.concat(bucketList.objects.map(o => ({ key: o.key, ipfsHash: o.customMetadata?.ipfsHash })))

    // if we have a hash, find the file with that hash
    if (config.hash) {
      fileKey = files.find(f => f.ipfsHash == config.hash)?.key
    }
  }

  console.log('>>>>>>>>> file key:', fileKey)

  try {
    fileObject = await BUCKET.get(fileKey);

    if (!fileObject) {
      return new Response(`File not found at path ${config.hash}`, { status: 404 });
    }

    const headersObj = {
      'cache-control': 'public, max-age=86400',
      'content-disposition': `inline ; filename="${fileObject.key}.${fileObject?.httpMetadata?.contentType}"`,
      // 'content-disposition': `attachment ; filename="${fileObject.key}"`,
      ...corsHeaders
    }

    if (fileObject?.httpMetadata?.contentType) {
      headersObj['content-type'] = fileObject?.httpMetadata?.contentType
    }

    const headers = new Headers(headersObj);
    fileObject?.writeHttpMetadata(headers);
    headers.set('etag', fileObject.httpEtag);

    return new Response(fileObject.body, {
      headers
    });
  } catch (e) {
    console.log('Hash Download error:', e)
    return new Response(`Error finding a file at ${config.hash}`, { status: 404 });
  }
}

