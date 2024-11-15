import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';


export async function handleAddFile(config, BUCKET, fileBuf) {
  try {
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
    let customFilename = config.customFilename || config.filename
    let upkey = `${scopeAndId}${version ? `${version}/` : ''}${filename}`
  
    if (customFilename) {
      upkey = `${scopeAndId}${version ? `${version}/` : ''}${customFilename}`
    } else {
      upkey = `${scopeAndId}${version ? `${version}/` : ''}${filename}`
    }
  
  
    if (!config.nanoid) {// if we're not using nanoids, then we're also skipping versioning
      upkey = `${scopeAndId}${filename}`
  
      // allow custom extension names for really long files (e.g. notion)
      if (customFilename) {
        upkey = `${scopeAndId}${customFilename}`
      } else {
        upkey = `${scopeAndId}${filename}`
      }
      version = null
    }
  
    console.log('>>> init upkey!:', upkey)
  
    if (config?.useVersioning == false || config?.useVersioning == 'false') {
      console.log('>>> skipping versioning')
      scopeAndId = config.scope ? `${config.scope}/` : ''
      upkey = `${scopeAndId}${filename}`
    }
  
    if (config.scope && bucketList?.objects?.length > 0) {
      id = config.scope?.split('/')[config.scope?.split('/').length - 1]
    }
  
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
    if (config.returnFile) {
      let fileObject = await BUCKET.get(upkey);
  
      if (!fileObject) {
        if (!fileBuf)
          fileBuf = await downloadFileBuf(config.url)
  
        let fileUintarr = new Uint8Array(fileBuf)
        ipfsHash = await dataHash(fileUintarr)
        console.log('[handleAddFile] uploading [key]:', upkey)
        fileObject = await BUCKET.put(upkey, fileBuf, {
          customMetadata: {
            ipfsHash,
            ...config.metadata,
            ...config.customMetadata
          }
        });
      }
  
      return {
        success: true,
        body: fileObject.body,
        metadata: {
          contentType: fileObject.httpMetadata?.contentType,
          etag: fileObject.httpEtag,
          customMetadata: fileObject.customMetadata,
          cacheControl: 'public, max-age=86400'
        }
      };
    } 
    
    // Non-returnFile case
    else {
      if (!fileBuf)
        fileBuf = await downloadFileBuf(config.url)
  
      let fileUintarr = new Uint8Array(fileBuf)
      ipfsHash = await dataHash(fileUintarr)
      console.log('[handleAddFile] uploading [key]:', upkey)
      await BUCKET.put(upkey, fileBuf, {
        customMetadata: {
          ipfsHash,
          ...config.metadata,
          ...config.customMetadata
        }
      });
  
      return {
        success: true,
        key: upkey,
        scope: config.scope || undefined,
        id,
        version: version || undefined,
        origin: config.url,
        latest: `${baseUrl}/${scopeAndId}`,
        permalink: `${baseUrl}/${upkey}`,
        ipfsHash,
        message: `Added ${upkey} successfully!`,
        metadata: {
          ...config.metadata,
          ...config.customMetadata
        }
      };
    }
  } catch (error) {
    console.error('[handleAddFile] Error:', error)
    throw new Error(`Failed to add file: ${error.message}`);
  }
}



