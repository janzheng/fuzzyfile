
import * as Hash from 'ipfs-only-hash'
// import { Buffer } from 'buffer'

export const dataHash = async (data) => {
  return await Hash.of(data)
}


export const downloadFileBuf = (url) => {
  try {
    console.log('[downloadFileBuf] downloading:', url)
    return fetch(url,
      { headers: { 'User-Agent': 'Mozilla/5.0' } })
      .then(x => x.arrayBuffer())
  } catch (e) {
    console.error('[downloadFileBuf] error:', e)
    return
  }
}
