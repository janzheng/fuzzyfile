import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';

export async function handleHashDownload(config, BUCKET) {
  try {
    const fileKey = await findFileByHash(config, BUCKET);
    if (!fileKey) {
      return {
        success: false,
        status: 404,
        error: 'File not found at path'
      };
    }

    const fileObject = await BUCKET.get(fileKey);
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
        key: fileObject.key,
        cacheControl: 'public, max-age=86400',
        contentDisposition: `inline; filename="${fileObject.key}.${fileObject?.httpMetadata?.contentType}"`,
        customMetadata: fileObject.customMetadata
      }
    };
  } catch (error) {
    console.error('[handleHashDownload] Error:', error)
    return {
      success: false,
      status: 500,
      error: `Failed to download file by hash: ${error.message}`
    };
  }
}

async function findFileByHash(config, BUCKET) {
  try {
    let bucketList = await BUCKET.list({
      include: ['customMetadata']
    });
    
    let files = bucketList.objects.map(o => ({ 
      key: o.key, 
      ipfsHash: o.customMetadata?.ipfsHash 
    }));
  
    let fileKey = config.hash ? files.find(f => f.ipfsHash === config.hash)?.key : null;
  
    while (bucketList.truncated && !fileKey) {
      bucketList = await BUCKET.list({
        cursor: bucketList.cursor,
        include: ['customMetadata']
      });
  
      files = files.concat(bucketList.objects.map(o => ({ 
        key: o.key, 
        ipfsHash: o.customMetadata?.ipfsHash 
      })));
  
      if (config.hash) {
        fileKey = files.find(f => f.ipfsHash === config.hash)?.key;
      }
    }
  
    return fileKey;
  } catch (error) {
    console.error('[findFileByHash] Error:', error)
    throw new Error(`Failed to find file by hash: ${error.message}`);
  }
}
