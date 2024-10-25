import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash, downloadFileBuf } from './utils.js'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';

export async function handleDownloadFile(config, BUCKET) {
  try {
    const files = await fetchFiles(config, BUCKET);
    
    if (files.length === 0) {
      throw new Error('No files found at path');
    }

    const zipResult = await createZipFile(files, BUCKET);

    return {
      success: true,
      body: zipResult.blob,
      metadata: {
        contentType: 'application/zip',
        contentDisposition: `attachment; filename="${config.scope}.zip"`,
        cacheControl: 'public, max-age=86400'
      }
    };
  } catch (error) {
    throw new Error(`Failed to create zip file: ${error.message}`);
  }
}

async function fetchFiles(config, BUCKET) {
  try {
    const prefix = `${config.scope}`;
    let bucketList = await BUCKET.list({ prefix });
    let files = bucketList.objects.map(o => ({ key: o.key }));
  
    while (bucketList.truncated) {
      bucketList = await BUCKET.list({ cursor: bucketList.cursor });
      files = files.concat(bucketList.objects.map(o => ({ key: o.key })));
    }
  
    return files;
  } catch (error) {
    console.error('[fetchFiles] Error:', error)
    throw new Error(`Failed to fetch files: ${error.message}`);
  }
}

async function createZipFile(files, BUCKET) {
  try {
    const zip = new JSZip();
  
    await Promise.all(files.map(async file => {
      const fileObject = await BUCKET.get(file.key);
      const arrayBuf = await fileObject.arrayBuffer();
      zip.file(file.key, arrayBuf, { binary: true });
    }));
  
    const blob = await zip.generateAsync({ type: "blob" });
    return { blob };
  } catch (error) {
    console.error('[createZipFile] Error:', error)
    throw new Error(`Failed to create zip file: ${error.message}`);
  }
}
