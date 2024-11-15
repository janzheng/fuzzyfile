import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';

export async function handleGetFile(config, BUCKET, request) {
  try {
    let key = await resolveFileKey(config, BUCKET);
    console.log('[handleGetFile] resolving [key]:', key)
    if (!key) {
      return {
        success: false,
        status: 404,
        error: 'File not found at path'
      };
    }
  
    const fileObject = await fetchFileObject(key, BUCKET, request);
    if (!fileObject) {
      return {
        success: false,
        status: 404,
        error: 'File not found at path'
      };
    }
  
    return {
      success: true,
      body: fileObject.body,
      metadata: {
        contentType: fileObject?.httpMetadata?.contentType,
        etag: fileObject.httpEtag,
        size: fileObject.size,
        key: fileObject.key,
        range: fileObject.range,
        cacheControl: 'public, max-age=86400',
        contentDisposition: `inline ; filename="${fileObject.key}"`,
      },
      status: request.headers.get("range") !== null ? 206 : 200
    };
  } catch (error) {
    console.error('[handleGetFile] Error:', error)
    return {
      success: false,
      status: 500,
      error: `Failed to get file: ${error.message}`
    };
  }
}

export async function resolveFileKey(config, BUCKET) {
  try {
    let key;
  
    if (typeof config.nanoid == undefined) {
      key = `${config.scope}${config.key ? `/${config.key}` : ''}`;
    } else if (config.key) {
      key = `${config.key}`;
    } else if (config.scope) {
      key = `${config.scope}`;
    } else {
      const scopeAndId = config.nanoid === false ? config.scope : `${config.scope}/${config.nanoid}`;
      
      const bucketList = await BUCKET.list({
        prefix: scopeAndId,
        include: ['httpMetadata', 'customMetadata']
      });
  
      const objects = bucketList.objects.sort((a, b) => 
        new Date(b.uploaded) - new Date(a.uploaded)
      );
  
      if (!objects.length) return null;
  
      const latestFile = config.version 
        ? objects.find(o => o.key?.includes(`/${config.version}/`))
        : objects[0];
  
      if (!latestFile) return null;
      key = latestFile.key;
    }
  
    return key;
  } catch (error) {
    console.error('[resolveFileKey] Error:', error)
    throw new Error(`Failed to resolve file key: ${error.message}`);
  }
}

async function fetchFileObject(key, BUCKET, request) {
  try {
    let fileObject = await BUCKET.get(key);
    console.log('[fetchFileObject] fetching [key]:', key, 'fileObject:', fileObject)
    
    const range = request?.headers.get("Range");
    if (range && fileObject) {
      const startEnd = range?.replace('bytes=', '')?.split('-')?.map(val => parseInt(val));
      const start = startEnd?.[0] || 0;
  
      if (start > 0) {
        fileObject = await BUCKET.get(key, {
          range: {
            offset: start,
            length: fileObject.range.length ? fileObject.range.length - start + 1 : undefined,
          }
        });
      }
    }
  
    return fileObject;
  } catch (error) {
    console.error('[fetchFileObject] Error:', error)
    throw new Error(`Failed to fetch file object: ${error.message}`);
  }
}
