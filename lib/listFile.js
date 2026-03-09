import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';



export async function handleListFile(config, BUCKET) {
  try {
    if (config.mode === 'folders' || config.folders) {
      return await listFolders(config, BUCKET);
    }

    const result = await fetchObjects(config, BUCKET);
    
    if (config.scope === '') {
      return groupByRootScope(result.objects, result.cursor, result.hasMore);
    }
    
    if (config.nanoid && !config.nanoid.includes('/')) {
      return groupByNanoid(result.objects, config.nanoid);
    }
    
    return {
      success: true,
      total: result.objects.length,
      items: result.objects,
      cursor: result.cursor || undefined,
      hasMore: result.hasMore
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
    
    const listOptions = {
      prefix,
      limit: Math.min(limit, 1000),
      include: ['httpMetadata', 'customMetadata']
    }

    if (config.cursor) {
      listOptions.cursor = config.cursor
    }

    let bucketList = await BUCKET.list(listOptions);
    
    let objects = mapBucketObjects(bucketList.objects);
    count += objects.length;
  
    while (bucketList.truncated && count < limit) {
      bucketList = await BUCKET.list({
        cursor: bucketList.cursor,
        include: ['httpMetadata', 'customMetadata']
      });
      const newObjects = mapBucketObjects(bucketList.objects);
      objects = objects.concat(newObjects.slice(0, limit - count));
      count += newObjects.length;
      if (count >= limit) break;
    }
  
    objects.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    return {
      objects,
      total: objects.length,
      cursor: bucketList.truncated ? bucketList.cursor : null,
      hasMore: bucketList.truncated || false
    };
  } catch (error) {
    console.error('[fetchObjects] Error:', error)
    throw new Error(`Failed to fetch objects: ${error.message}`);
  }
}

async function listFolders(config, BUCKET) {
  try {
    const prefix = config.scope ? (config.scope.endsWith('/') ? config.scope : config.scope + '/') : '';
    const limit = config.limit || 1000;

    const listOptions = {
      prefix,
      delimiter: '/',
      limit: Math.min(limit, 1000),
      include: ['httpMetadata', 'customMetadata']
    }

    if (config.cursor) {
      listOptions.cursor = config.cursor
    }

    const bucketList = await BUCKET.list(listOptions);

    const folders = (bucketList.delimitedPrefixes || []).map(p => ({
      prefix: p,
      name: p.replace(prefix, '').replace(/\/$/, ''),
      type: 'folder'
    }))

    const files = mapBucketObjects(bucketList.objects)

    return {
      success: true,
      prefix,
      folders,
      files,
      totalFolders: folders.length,
      totalFiles: files.length,
      cursor: bucketList.truncated ? bucketList.cursor : undefined,
      hasMore: bucketList.truncated || false
    }
  } catch (error) {
    console.error('[listFolders] Error:', error)
    throw new Error(`Failed to list folders: ${error.message}`)
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

function groupByRootScope(objects, cursor, hasMore) {
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
      items: grouped,
      cursor: cursor || undefined,
      hasMore
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
