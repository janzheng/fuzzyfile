import { dataHash } from './utils.js'
import { nanoid } from 'nanoid'

export let baseUrl = BASE_URL || 'https://f2.phage.directory';

export const handleAddData = async (config, BUCKET) => {
  try {
    let data = config.data
    let id = config.scope ? (config.nanoid || `${nanoid(8)}`) : undefined
    let scopeAndId = config.scope ? `${config.scope}/${id}/` : ''
    let ipfsHash
    
    if (config.nanoid == '') {
      console.log('>>> skipping nanoid')
      scopeAndId = config.scope ? `${config.scope}/` : ''
    }

    // check if this scope + id exists; if it does, increment the version
    let bucketList = await BUCKET.list({
      prefix: scopeAndId
    });

    let version = bucketList?.objects?.length > 0 ? `v${bucketList?.objects?.length}` : `v0`
    let filename = config.key || 'data.json'
    let customFilename = config.customFilename || config.filename
    let upkey = `${scopeAndId}${version ? `${version}/` : ''}${filename}`

    if (customFilename) {
      upkey = `${scopeAndId}${version ? `${version}/` : ''}${customFilename}`
    }

    if (!config.nanoid) {
      upkey = `${scopeAndId}${filename}`
      if (customFilename) {
        upkey = `${scopeAndId}${customFilename}`
      }
      version = null
    }

    if (config?.useVersioning == false || config?.useVersioning == 'false') {
      console.log('>>> skipping versioning')
      scopeAndId = config.scope ? `${config.scope}/` : ''
      upkey = `${scopeAndId}${filename}`
    }

    if (config.scope && bucketList?.objects?.length > 0) {
      id = config.scope?.split('/')[config.scope?.split('/').length - 1]
    }

    if (config.optionStr == 'direct-upload') {
      console.log('>>> using direct upload')
      upkey = config.scope ? `${config.scope}/${filename}` : filename
    }

    upkey = encodeURI(upkey)
    
    // If data is an object/array, stringify it
    if (typeof data === 'object') {
      data = JSON.stringify(data)
    }

    // Convert data to Uint8Array for storage
    const encoder = new TextEncoder()
    const buffer = encoder.encode(data)

    // Generate IPFS hash
    ipfsHash = await dataHash(buffer)

    const putOptions = {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: config.cacheControl || 'public, max-age=86400',
      },
      customMetadata: {
        ipfsHash,
        ...(config.customMetadata || {})
      }
    }

    await BUCKET.put(upkey, buffer, putOptions)

    return {
      success: true,
      key: upkey,
      scope: config.scope || undefined,
      id,
      version: version || undefined,
      size: buffer.length,
      metadata: putOptions.httpMetadata,
      customMetadata: putOptions.customMetadata,
      latest: `${baseUrl}/${scopeAndId}`,
      permalink: `${baseUrl}/${upkey}`,
      ipfsHash,
      message: `Added data to ${upkey} successfully!`
    }
  } catch (error) {
    console.error('[handleAddData]', error)
    throw new Error(`Failed to add data: ${error.message}`)
  }
}
