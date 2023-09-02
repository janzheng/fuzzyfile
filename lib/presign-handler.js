
import { corsHeaders } from './cors-handler.js'


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
  let params = {
    Bucket: BUCKET_NAME, // bucket,
    Key: config.scope + '/' + config.filename
  };

  // console.log('params:', params)
  const command = new PutObjectCommand(params);
  const url = await getSignedUrl(S3, command, { expiresIn: config.expiresIn || 3600 });
  // console.log('getPresignedUrl config S3 --->:', config, command, S3, url)

  // console.log('getPresignedUrl RESPONSE:::', url);
  return url;
};