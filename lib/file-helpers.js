
import * as Hash from 'ipfs-only-hash'
// import { Buffer } from 'buffer'

export const dataHash = async (data) => {
  return await Hash.of(data)
}