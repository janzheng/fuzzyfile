import { corsHeaders } from '../handlers/cors-handler.js'
import { resolveFileKey } from './getFile.js'

export async function handleGetFileDetails(config, BUCKET) {
  try {
    let fileKey;
    
    // First try to find by hash if provided
    if (config.hash || config.details) {
      fileKey = await findFileByHash(config, BUCKET);
    }

    // If no hash match found, try normal file resolution
    if (!fileKey) {
      fileKey = await resolveFileKey(config, BUCKET);
    }

    console.log('>>>> [handleGetFileDetails] fileKey', config, fileKey)


    if (!fileKey) {
      return {
        success: false,
        status: 404,
        error: `File not found`
      };
    }

    console.log('[handleGetFileDetails] fileKey', fileKey)
    const fileObject = await BUCKET.get(fileKey);
    if (!fileObject) {
      return {
        success: false,
        status: 404,
        error: `File not found at path ${fileKey}`
      };
    }

    return {
      success: true,
      status: 200,
      metadata: {
        key: fileObject.key,
        size: fileObject.size,
        uploaded: fileObject.uploaded,
        httpMetadata: fileObject.httpMetadata,
        customMetadata: fileObject.customMetadata,
        httpEtag: fileObject.httpEtag,
        version: fileObject.version
      }
    };
  } catch (error) {
    console.error('[handleGetFileDetails] Error:', error)
    return {
      success: false,
      status: 500,
      error: `Failed to get file details: ${error.message}`
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
  
    let fileKey = (config.hash || config.details) ? 
      files.find(f => f.ipfsHash === (config.hash || config.details))?.key : 
      config.key;
  
    while (bucketList.truncated && !fileKey) {
      bucketList = await BUCKET.list({
        cursor: bucketList.cursor,
        include: ['customMetadata']
      });
  
      files = files.concat(bucketList.objects.map(o => ({ 
        key: o.key, 
        ipfsHash: o.customMetadata?.ipfsHash 
      })));
  
      if (config.hash || config.details) {
        fileKey = files.find(f => f.ipfsHash === (config.hash || config.details))?.key;
      }
    }
  
    return fileKey;
  } catch (error) {
    console.error('[findFileByHash] Error:', error)
    throw new Error(`Failed to find file by hash: ${error.message}`);
  }
}
