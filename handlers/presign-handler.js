
import { corsHeaders } from './cors-handler.js'
import { nanoid } from 'nanoid'
export let baseUrl = BASE_URL || 'https://f2.phage.directory';


import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

export const getPresignedUrl = async (config) => {

  try { 
    // add a file based on scope, nanoid, and filename
    // let id = config.scope ? (config.nanoid || `ff-${nanoid(8)}`) : undefined
    let id = config.scope ? (config.nanoid || `${nanoid(8)}`) : undefined
    let scopeAndId = config.scope ? `${config.scope}/${id}/` : ''
  
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
  
    console.log('>>> init upkey:', upkey)
  
    if (config?.useVersioning == false || config?.useVersioning == 'false') {
      console.log('>>> skipping versioning')
      scopeAndId = config.scope ? `${config.scope}/` : ''
      upkey = `${scopeAndId}${filename}`
    }
  
    if (config.scope && bucketList?.objects?.length > 0)
      id = config.scope.split('/')[config.scope.split('/').length - 1]
  
    // if using "direct upload" mode we skip adding id and versioning
    if (config.optionStr == 'direct-upload') {
      console.log('>>> using direct upload')
      if (config.scope)
        upkey = `${config.scope}/${filename}`
      else
        upkey = `${filename}`
    }
  
    upkey = encodeURI(upkey) // get rid of symbols that might break the url
  
    console.log('[getPresignedUrl] Using key:', upkey, 'scopeAndId:', scopeAndId, 'nanoid:', config.nanoid||id)
  
  
  
  

  
    let params = {
      Bucket: BUCKET_NAME, // bucket,
      Key: upkey, // config.scope + '/' + config.filename,
      ipfsHash: config.ipfsHash, // must be sent from client! We don't see the file here
      // can add any metadata here
    };
  
    // console.log('params:', params)
    const command = new PutObjectCommand(params);
    const url = await getSignedUrl(S3, command, { expiresIn: config.expiresIn || 3600 });
    // console.log('getPresignedUrl config S3 --->:', config, command, S3, url)
  
    // console.log('getPresignedUrl RESPONSE:::', url);
    return {
      key: upkey, 
      scope: config.scope,
      id,
      version: version || undefined,
      origin: config.url,
      latest: `${baseUrl}/${scopeAndId}`,
      permalink: `${baseUrl}/${upkey}`,
      ipfsHash: config.ipfsHash,
      message: "Signed S3 Upload URL: " + url,
      url,
    };

  } catch(e) {
    console.error('[getPresignedUrl] error:', e)
  }

};