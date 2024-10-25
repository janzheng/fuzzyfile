
// used as a proxy for airtable requests, so only applicable for GET

// import { corsHeaders } from '../handlers/cors-handler.js'
import { dataHash } from './utils.js'
import { downloadFileBuf } from './utils.js'
export let baseUrl = 'https://f2.phage.directory'



export async function handleAirtable(url, BUCKET) {

  /*
    situations where we want to upload the file

    1: "dl.airtable.com" 
      >>> https://dl.phage.directory/https://dl.airtable.com/guQYoqSQhaQ3K7kTau2w_full_ESKAPE%20Tshirt%20Christmas.JPG
      >>> https://dl.phage.directory/https://dl.airtable.com/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
      >>> https://dl.phage.directory/https://dl.airtable.com/.attachmentThumbnails/abe7e69d4aee2659455fb88d3e2ea714/c8ff240c
    
      - Upload Key: us anything after "dl.airtable.com/"
        - .attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg


    2. "v5.airtableusercontent.com"
      >>> https://dl.phage.directory/https://v5.airtableusercontent.com/v1/14/14/1672898400000/WPhvaOiEVGFpDE93ylLSJg/aU3dE68zBsSHzNJ2WB_v-3_uF0hYmdR1y7Utu3j4tk1Fe_ZHOJgcnRb_w8_TDlov15GInr9SE6DA9_bpy3LU4A/9yfsiQAgmbLSFX8QBj1xa-FZt362hlB8U1DhxcYnAc8
      
      - keep in mind that these expire in 4 hours, so you'll have lots of duplicates
      - you can't use IFPS as key, because you'll need to download the file every time to check for its hash!
      - upload key: anything after "v5.airtableusercontent.com/"


    3. No Airtable domain — ".attachments/" or ".attachmentThumbnails/" or "v5.airtableusercontent.com"
    >>> Examples:
      https://dl.phage.directory/.attachments/5def0566a6d61b54461b09f58338609d/e34f0c58/phage-shipping-around-aus.jpg
      https://dl.phage.directory/.attachmentThumbnails/abe7e69d4aee2659455fb88d3e2ea714/c8ff240c
      https://dl.phage.directory/v5.airtableusercontent.com/v1/14/14/1672898400000/WPhvaOiEVGFpDE93ylLSJg/aU3dE68zBsSHzNJ2WB_v-3_uF0hYmdR1y7Utu3j4tk1Fe_ZHOJgcnRb_w8_TDlov15GInr9SE6DA9_bpy3LU4A/9yfsiQAgmbLSFX8QBj1xa-FZt362hlB8U1DhxcYnAc8
    - note this example lacks the Airtable domain
    - Upload Key: Anything that is ".attachments/" or ".attachmentThumbnails/" + the rest of the URL
    - This implies that the root URL is at https://dl.airtable.com

  */
  
try {
  
    let { pathname, searchParams } = new URL(url)
    pathname = pathname.slice(1) // gets rid of starting slash
    let upkey, fileBuf
  
    // if given any params, we abort "airtable mode"
    let add = searchParams.get('add')
    let urlParam = searchParams.get('url')
    let name = searchParams.get('name')
    let download = searchParams.get('download')
    if(add || urlParam || name || download) {
      return false
    }
  
    // note some browsers screw with double dashes in URLs and only keep one of them
    // also, need to use startsWith and not includes — since it'll screw up other uploads that aren't tied to airtable-related uploads
    let isAirtableUrl = pathname.startsWith('https://dl.airtable.com') || pathname.startsWith('https:/dl.airtable.com') ||
      pathname.startsWith('https://v5.airtableusercontent.com') || pathname.startsWith('https:/v5.airtableusercontent.com') ||
      pathname.startsWith('.attachments') ||
      pathname.startsWith('.attachmentThumbnails') ||
      pathname.startsWith('v5.airtableusercontent.com')
  
    if (!isAirtableUrl) {
      return null;
    }
    
    // find position of pathname after "dl.airtable.com" or "v5.airtableusercontent.com"
    // remove everything in pathname up to that position
    // use the remainder as the key for the upload
    if (pathname.indexOf('dl.airtable.com') >= 0) {
      upkey = pathname.slice(pathname.indexOf('dl.airtable.com') + 16)
    }
    if (pathname.indexOf('v5.airtableusercontent.com') >= 0) {
      upkey = pathname.slice(pathname.indexOf('v5.airtableusercontent.com') + 27)
      if (!pathname.startsWith('https://')) {
        pathname = "https://" + pathname
      }
    }
  
    if (!upkey) {
      upkey = pathname // this is for .attachments and .attachmentThumbnails or v5.airtableusercontent.com
      // straight up keep the entire pathname as the key
      if(upkey.startsWith('.attachment')) {
        pathname = "https://dl.airtable.com/" + upkey
      }
    }
    console.log('\n\n>>>>>>>>>>> Airtable Path: ', pathname, "\n>>>>>>>>>>> R2 Key:", upkey, '\n\n')
  
  
    let fileObject = await BUCKET.get(upkey);
  
    if (!fileObject) {
      fileBuf = await downloadFileBuf(pathname)
      console.log('downloaded fileBuf:', fileBuf)
      let fileUintarr = new Uint8Array(fileBuf)
      let ipfsHash = await dataHash(fileUintarr)
      console.log('>>> ipfsHash:', ipfsHash)
      fileObject = await BUCKET.put(upkey, fileBuf, {
        customMetadata: {
          ipfsHash,
        }
      });
    }
  
    if(fileObject) {
      return {
        body: fileObject.body,
        metadata: {
          contentType: fileObject.httpMetadata?.contentType,
          etag: fileObject.httpEtag,
          customMetadata: fileObject.customMetadata
        },
        success: true
      };
    }
  
    return { success: false }
  
  } catch (error) {
    console.error('[handleAirtable] Error:', error)
    throw new Error(`Failed to handle airtable request: ${error.message}`);
  }
  // if(fileObject) {
  //   const headersObj = {
  //     'cache-control': 'public, max-age=86400',
  //     ...corsHeaders
  //   }

  //   const headers = new Headers(headersObj);
  //   fileObject?.writeHttpMetadata(headers);
  //   headers.set('etag', fileObject?.httpEtag);

  //   return new Response(fileObject.body, {
  //     headers
  //   });
  // }
}