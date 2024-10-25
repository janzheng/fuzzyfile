export let baseUrl = BASE_URL || 'https://f2.phage.directory';


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
    if (pathArr[1] == 'download') {
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
    else if (pathArr[1] == 'details') {
      // Now handles both formats:
      // 1. /details/Qma5zM3diAxAegs3FJWhU52k5h3sX7iB6hS7PRTzWVJZ9Q (hash-based)
      // 2. /details/kittens/kwa9Hq6e/kitten-playing.jpg (path-based)
      let remainingPath = pathArr?.slice(2)?.join('/')

      if (pathname?.endsWith('/'))
        pathname = pathname.slice(0, -1)

      // Check if the remaining path looks like a hash (simple check for now)
      const looksLikeHash = remainingPath.length > 40 && !remainingPath.includes('/')

      return {
        cmd: 'details',
        ...(looksLikeHash ? { hash: remainingPath } : { 
          scope: remainingPath,
          key: remainingPath,
        })
      }
    }
    else if (src) {
      // if ?add or ?url  is present, we're adding a file
      // let key equal to the file name of the given url
      // if name is present, use that as the key

      pathname = pathname.slice(1) // remove starting slash
      let nanoid = pathArr.length <= 4 ? pathArr?.[2] : undefined

      if (nanoid == '') // if nanoid is empty, we clear it so we can generate a new one later
        nanoid = undefined

      // console.log('sigh', pathArr, nanoid)

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
            if (match && match.length > 0) {
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
      if (urlParam) {
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
          if (nanoid == 'list') {
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
    throw new Error(`Failed to handle search params: ${e.message}`);
  }
}



