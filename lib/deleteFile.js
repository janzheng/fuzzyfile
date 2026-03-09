import { corsHeaders } from '../handlers/cors-handler.js'

export async function handleDeleteFile(config, BUCKET) {
  try {
    if (!config.key && !config.keys) {
      throw new Error('No key or keys provided for deletion')
    }

    if (config.keys && Array.isArray(config.keys)) {
      return await bulkDelete(config.keys, BUCKET)
    }

    return await singleDelete(config.key, BUCKET)
  } catch (error) {
    console.error('[handleDeleteFile] Error:', error)
    throw new Error(`Failed to delete: ${error.message}`)
  }
}

async function singleDelete(key, BUCKET) {
  const existing = await BUCKET.head(key)
  if (!existing) {
    return {
      success: false,
      status: 404,
      error: `File not found: ${key}`
    }
  }

  await BUCKET.delete(key)

  return {
    success: true,
    key,
    message: `Deleted ${key} successfully`
  }
}

async function bulkDelete(keys, BUCKET) {
  const results = { deleted: [], notFound: [], errors: [] }

  const chunks = []
  for (let i = 0; i < keys.length; i += 100) {
    chunks.push(keys.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (key) => {
      try {
        const existing = await BUCKET.head(key)
        if (!existing) {
          results.notFound.push(key)
          return
        }
        await BUCKET.delete(key)
        results.deleted.push(key)
      } catch (error) {
        results.errors.push({ key, error: error.message })
      }
    }))
  }

  return {
    success: true,
    deleted: results.deleted.length,
    notFound: results.notFound.length,
    errors: results.errors.length,
    details: results,
    message: `Deleted ${results.deleted.length} file(s)`
  }
}

export async function handleDeleteByPrefix(config, BUCKET) {
  try {
    if (!config.prefix) {
      throw new Error('No prefix provided for deletion')
    }

    let bucketList = await BUCKET.list({ prefix: config.prefix })
    let keys = bucketList.objects.map(o => o.key)

    while (bucketList.truncated) {
      bucketList = await BUCKET.list({ cursor: bucketList.cursor })
      keys = keys.concat(bucketList.objects.map(o => o.key))
    }

    if (keys.length === 0) {
      return {
        success: false,
        status: 404,
        error: `No files found with prefix: ${config.prefix}`
      }
    }

    return await bulkDelete(keys, BUCKET)
  } catch (error) {
    console.error('[handleDeleteByPrefix] Error:', error)
    throw new Error(`Failed to delete by prefix: ${error.message}`)
  }
}
