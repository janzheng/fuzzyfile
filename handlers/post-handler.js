import { handleListFile } from '../lib/listFile.js'
import { corsHeaders } from './cors-handler.js'
import { handleHashDownload } from '../lib/hashDownload.js'
import { handleAddFile } from '../lib/addFile.js'
import { handleGetFile } from '../lib/getFile.js'
import { handleDownloadFile } from '../lib/downloadFile.js'
import { handleGetFileDetails } from '../lib/getFileDetails.js'
import { getPresignedUrl } from './presign-handler.js'
import { handleAddData } from '../lib/addData.js'

export const postHandler = async (request, BUCKET) => {
  try {
    if (request.headers.get('content-type') === "application/json") {
      const config = await request.json();
      console.log('[postHandler] config:', config);

      if (!config?.cmd) {
        throw new Error('No command specified');
      }

      switch (config.cmd) {
        case 'add': {
          const addResult = await handleAddFile(config, BUCKET);
          if (config.returnFile && addResult.success) {
            const headers = new Headers({
              'cache-control': addResult.metadata.cacheControl,
              ...corsHeaders
            });
            
            if (addResult.metadata) {
              Object.entries(addResult.metadata).forEach(([key, value]) => {
                if (value && key !== 'cacheControl') headers.set(key, value);
              });
            }
            
            return new Response(addResult.body, { headers });
          }
          return new Response(JSON.stringify(addResult), { headers: corsHeaders });
        }

        case 'get': {
          const fileResult = await handleGetFile(config, BUCKET, request);
          if (fileResult.success) {
            const headers = new Headers({
              'cache-control': fileResult.metadata.cacheControl,
              'content-disposition': fileResult.metadata.contentDisposition,
              ...corsHeaders
            });
            
            if (fileResult.metadata.contentType) {
              headers.set('content-type', fileResult.metadata.contentType);
            }
            
            return new Response(fileResult.body, { headers });
          }
          return new Response(JSON.stringify(fileResult), { headers: corsHeaders });
        }

        case 'list': {
          const listResult = await handleListFile(config, BUCKET);
          return new Response(JSON.stringify(listResult), { headers: corsHeaders });
        }

        case 'download': {
          const downloadResult = await handleDownloadFile(config, BUCKET);
          if (downloadResult.success) {
            const headers = new Headers({
              'content-type': downloadResult.metadata.contentType,
              'content-disposition': downloadResult.metadata.contentDisposition,
              'cache-control': downloadResult.metadata.cacheControl,
              ...corsHeaders
            });
            return new Response(downloadResult.body, { headers });
          }
          break;
        }

        case 'hash': {
          const hashResult = await handleHashDownload(config, BUCKET);
          if (hashResult.success) {
            const headers = new Headers({
              'cache-control': hashResult.metadata.cacheControl,
              'content-disposition': hashResult.metadata.contentDisposition,
              ...corsHeaders
            });
            
            if (hashResult.metadata.contentType) {
              headers.set('content-type', hashResult.metadata.contentType);
            }
            
            hashResult.metadata.customMetadata && 
              Object.entries(hashResult.metadata.customMetadata).forEach(([key, value]) => {
                if (value) headers.set(key, value);
              });
            
            headers.set('etag', hashResult.metadata.etag);
            return new Response(hashResult.body, { headers });
          }
          return new Response(JSON.stringify(hashResult), { headers: corsHeaders });
        }

        case 'details': {
          const detailsResult = await handleGetFileDetails(config, BUCKET);
          if (detailsResult.success) {
            return new Response(JSON.stringify(detailsResult.metadata), { headers: corsHeaders });
          }
          return new Response(JSON.stringify(detailsResult), { headers: corsHeaders });
        }

        case 'presigned':
        case 'presign': {
          const presignResult = await getPresignedUrl(config);
          return new Response(JSON.stringify(presignResult), { headers: corsHeaders });
        }

        case 'data': {
          const dataResult = await handleAddData(config, BUCKET);
          if (dataResult.success) {
            return new Response(JSON.stringify(dataResult), {
              headers: {
                'content-type': 'application/json',
                ...corsHeaders
              }
            });
          }
          return new Response(JSON.stringify(dataResult), { headers: corsHeaders });
        }

        default:
          return new Response(
            JSON.stringify({ error: `Command "${config.cmd}" not implemented` }), 
            { headers: corsHeaders }
          );
      }
    } 
    else if (request.headers.get('content-type')?.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll('files');
      const filePath = formData.get('filePath');
      let scope = formData.get('scope');
      let nanoid = formData.get('nanoid');
      let useVersioning = formData.get('versioning') !== 'false';

      if (filePath) {
        const cleanPath = filePath.replace(/^[./]+/, '');
        const pathParts = cleanPath?.split('/');
        pathParts.pop();
        const cleanedFilePath = pathParts.join('/').replace(/\/$/, '');
        nanoid = '';
        scope += "/" + cleanedFilePath;
        useVersioning = false;
      }

      const results = await Promise.all(files.map(async file => {
        const fileData = await file.arrayBuffer();
        return handleAddFile({
          cmd: 'add',
          key: file.name,
          scope,
          nanoid,
          useVersioning,
        }, BUCKET, fileData);
      }));

      return new Response(JSON.stringify(results), { headers: corsHeaders });
    }

    throw new Error('Unsupported content type');

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500,
        headers: corsHeaders 
      }
    );
  }
};
