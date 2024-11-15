import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';



export async function handleListFile(config, BUCKET) {
  try {
    const { objects, total } = await fetchObjects(config, BUCKET);
    
    if (config.scope === '') {
      return groupByRootScope(objects);
    }
    
    if (config.nanoid && !config.nanoid.includes('/')) {
      return groupByNanoid(objects, config.nanoid);
    }
    
    return {
      success: true,
      total: objects.length,
      items: objects
    };
  } catch (error) {
    console.error('[handleListFile] Error:', error)
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

async function fetchObjects(config, BUCKET) {
  try {
    const prefix = config.nanoid ? `${config.scope || ''}/${config.nanoid || ''}` : `${config.scope || ''}`;
    const limit = config.limit || 100;
    let count = 0;
    
    let bucketList = await BUCKET.list({
      prefix,
      include: ['httpMetadata', 'customMetadata']
    });
    
    let objects = mapBucketObjects(bucketList.objects);
    count += objects.length;
  
    while (bucketList.truncated && count < limit) {
      bucketList = await BUCKET.list({ cursor: bucketList.cursor });
      const newObjects = mapBucketObjects(bucketList.objects);
      objects = objects.concat(newObjects.slice(0, limit - count));
      count += newObjects.length;
      if (count >= limit) break;
    }
  
    objects.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
    return { objects, total: objects.length };
  } catch (error) {
    console.error('[fetchObjects] Error:', error)
    throw new Error(`Failed to fetch objects: ${error.message}`);
  }
}

function mapBucketObjects(objects) {
  try {
    return objects.map(o => ({
      key: o.key,
      uploaded: o.uploaded,
      size: o.size,
      type: o.httpMetadata?.contentType,
      ipfsHash: o.customMetadata?.ipfsHash
    }));
  } catch (error) {
    console.error('[mapBucketObjects] Error:', error)
    throw new Error(`Failed to map bucket objects: ${error.message}`);
  }
}

function groupByRootScope(objects) {
  try {
    const grouped = {};
    objects.forEach(o => {
      const id = o.key.split('/')[0];
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(o);
    });
    
    return {
      success: true,
      total: objects.length,
      items: grouped
    };
  } catch (error) {
    console.error('[groupByRootScope] Error:', error)
    throw new Error(`Failed to group by root scope: ${error.message}`);
  }
}

function groupByNanoid(objects, nanoid) {
  try {
    const grouped = {};
    objects.forEach(o => {
      const id = o.key.split('/')[1];
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(o);
    });
    
    return {
      success: true,
      items: grouped[nanoid],
      total: grouped[nanoid]?.length || 0
    };
  } catch (error) {
    console.error('[groupByNanoid] Error:', error)
    throw new Error(`Failed to group by nanoid: ${error.message}`);
  }
}
