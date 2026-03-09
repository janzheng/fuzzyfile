export async function handleRenameFile(config, BUCKET) {
  try {
    if (!config.from) {
      throw new Error('No source key (from) provided')
    }
    if (!config.to) {
      throw new Error('No destination key (to) provided')
    }

    const sourceObject = await BUCKET.get(config.from)
    if (!sourceObject) {
      return {
        success: false,
        status: 404,
        error: `Source file not found: ${config.from}`
      }
    }

    const destExists = await BUCKET.head(config.to)
    if (destExists && !config.overwrite) {
      return {
        success: false,
        status: 409,
        error: `Destination already exists: ${config.to}. Set "overwrite": true to replace.`
      }
    }

    await BUCKET.put(config.to, sourceObject.body, {
      httpMetadata: sourceObject.httpMetadata,
      customMetadata: sourceObject.customMetadata
    })

    await BUCKET.delete(config.from)

    return {
      success: true,
      from: config.from,
      to: config.to,
      message: `Renamed ${config.from} → ${config.to}`
    }
  } catch (error) {
    console.error('[handleRenameFile] Error:', error)
    throw new Error(`Failed to rename: ${error.message}`)
  }
}
