// import { handleAddFile, handleGetFile, handleListFile, handleDownloadFile, handleHashDownload, handleGetFileDetails } from './helpers.js'

import { handleListFile } from '../lib/listFile.js'
import { corsHeaders } from './cors-handler.js'
import { handleHashDownload } from '../lib/hashDownload.js'

import { handleAirtable } from '../lib/airtable.js'
import { handleSearchParams } from '../lib/searchParams.js'
import { handleAddFile } from '../lib/addFile.js'
import { handleGetFile } from '../lib/getFile.js'
import { handleDownloadFile } from '../lib/downloadFile.js'
import { handleGetFileDetails } from '../lib/getFileDetails.js'
import { handleAddData } from '../lib/addData.js'

const contentTypeMap = {
  // Text files
  'txt': 'text/plain',
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'csv': 'text/csv',
  'ics': 'text/calendar',
  'calendar': 'text/calendar',
  'md': 'text/markdown',

  // Application files
  'json': 'application/json',
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'xml': 'application/xml',
  'pdf': 'application/pdf',
  'zip': 'application/zip',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Image files
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',

  // Audio files
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',

  // Video files
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'wmv': 'video/x-ms-wmv',

  // Font files
  'ttf': 'font/ttf',
  'otf': 'font/otf',
  'woff': 'font/woff',
  'woff2': 'font/woff2',

  // Other common types
  'yaml': 'application/yaml',
  'yml': 'application/yaml',
  'epub': 'application/epub+zip',
  'rtf': 'application/rtf',
};

export const getHandler = async (request, BUCKET) => {
  try {
    // const { searchParams } = new URL(request.url)
    // let object
    // let url = searchParams.get('url')
    // let keyurl = "https://" + key.substring(7)// pathname does weird things with double // s


    // skip favicon requests since they throw errors and are generally dumb
    let url = new URL(request.url)
    if (url.pathname.includes("/favicon.ico") && url.pathname?.split('/').length == 2) {
      return new Response('favicon.ico', { status: 200 })
    }


    // let airtableRes = await handleAirtable(request.url, BUCKET)
    // if (airtableRes) {
    //   // returns an image, if handling an Airtable attachment
    //   return airtableRes
    // }
    const airtableResult = await handleAirtable(request.url, BUCKET);

    if (airtableResult?.success) {
      const headers = new Headers({
        'cache-control': 'public, max-age=86400',
        ...corsHeaders
      });

      if (airtableResult.metadata) {
        Object.entries(airtableResult.metadata).forEach(([key, value]) => {
          if (value) headers.set(key, value);
        });
      }

      return new Response(airtableResult.body, { headers });
    }

    
    let config = await handleSearchParams(request.url, BUCKET)

    console.log('[getHandler][paramObj]', config)

    if (config && config?.cmd == 'add') {
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
      } else if (addResult.success) {
        return new Response(JSON.stringify(addResult), {
          headers: corsHeaders
        });
      }
    } else if (config && config?.cmd == 'get') {
      try {
        console.log('[getHandler][get] config:', config)
        const fileResult = await handleGetFile(config, BUCKET, request);
        
        console.log('[getHandler] Raw response from handleGetFile:', {
          success: fileResult.success,
          status: fileResult.status,
          metadata: fileResult.metadata,
          bodyType: typeof fileResult.body,
          bodyIsStream: fileResult.body instanceof ReadableStream
        });
        
        if (fileResult.success) {
          const headers = new Headers({
            'cache-control': fileResult.metadata.cacheControl,
            'content-disposition': fileResult.metadata.contentDisposition,
            'Content-Length': fileResult.metadata.size,
            ...corsHeaders
          });

          if (fileResult.metadata.contentType) {
            headers.set('Content-Type', fileResult.metadata.contentType);
          }

          if (fileResult.metadata.contentType?.startsWith('video/')) {
            headers.set('Accept-Ranges', 'bytes');
          }

          if (fileResult.metadata.range) {
            headers.set('Content-Range', 
              `bytes ${fileResult.metadata.range.offset}-${fileResult.metadata.range.offset + fileResult.metadata.range.length - 1}/${fileResult.metadata.size}`
            );
          }

          headers.set('etag', fileResult.metadata.etag);

          // Get the file extension and determine the content type
          const fileKey = fileResult.metadata.key;
          const extension = fileKey.split('.').pop().toLowerCase();
          console.log('[getHandler] File extension:', extension);
          
          // Use the content type from metadata if available, otherwise use our mapping
          let contentType = fileResult.metadata.contentType;
          
          // If content type is missing or generic, use our mapping
          if (!contentType || contentType === 'application/octet-stream') {
            contentType = contentTypeMap[extension] || 'application/octet-stream';
            console.log('[getHandler] Using mapped content type:', contentType, 'for extension:', extension);
          }
          
          console.log('[getHandler][contentType] ', contentType, fileResult);

          // For non-ICS files or if ICS special handling failed
          const headersFinal = {
            ...corsHeaders,
            'Content-Type': contentType,
            'ETag': fileResult.metadata.etag,
            'Cache-Control': fileResult.metadata.cacheControl || 'no-cache',
            'Content-Disposition': fileResult.metadata.contentDisposition || 'inline',
          };

          console.log('[getHandler] Final response headers:', headersFinal);

          // Create and return the response
          return new Response(fileResult.body, {
            status: fileResult.status,
            headers: headersFinal
          });
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 404,
            headers: corsHeaders 
          }
        );
      }
    } else if (config && config?.cmd == 'list') {
      try {
        const listResult = await handleListFile(config, BUCKET);
        
        if (listResult.success) {
          return new Response(JSON.stringify({
            total: listResult.total,
            items: listResult.items
          }), {
            headers: corsHeaders
          });
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 500,
            headers: corsHeaders 
          }
        );
      }
    } else if (config && config?.cmd == 'download') {
      try {
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
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 404,
            headers: corsHeaders 
          }
        );
      }
    } else if (config && config?.cmd == 'hash') {
      try {
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
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 404,
            headers: corsHeaders 
          }
        );
      }
    } else if (config && config?.cmd == 'details') {
      try {
        console.log('[getHandler][details] config', config)
        const detailsResult = await handleGetFileDetails(config, BUCKET);
        
        if (detailsResult.success) {
          return new Response(JSON.stringify(detailsResult.metadata), {
            headers: corsHeaders
          });
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 404,
            headers: corsHeaders 
          }
        );
      }
    } else if (config && config?.cmd == 'data') {
      try {
        // For GET requests, parse search params into data object
        if (!config.data) {
          const dataParams = {}
          const url = new URL(request.url)
          url.searchParams.forEach((value, key) => {
            if (!['cmd', 'key'].includes(key)) {
              dataParams[key] = value
            }
          })
          config.data = dataParams
        }

        const dataResult = await handleAddData(config, BUCKET)
        
        if (dataResult.success) {
          return new Response(JSON.stringify(dataResult), {
            headers: {
              'content-type': 'application/json',
              ...corsHeaders
            }
          })
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }), 
          { 
            status: 500,
            headers: corsHeaders 
          }
        )
      }
    }

    return new Response('Not found', {
      status: 404,
      headers: corsHeaders
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}
