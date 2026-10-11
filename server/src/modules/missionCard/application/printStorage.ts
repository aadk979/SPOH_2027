import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../../config/env.js';
import { NotFoundError, ServiceUnavailableError } from '../../../platform/errors/index.js';

export interface CardPrintStorage {
  write(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}
function configured() {
  if (!env.S3_EXPORTS_BUCKET) throw new ServiceUnavailableError('Print storage is not configured. Contact the platform administrator.');
  return { client: new S3Client({ region: env.AWS_REGION }), bucket: env.S3_EXPORTS_BUCKET };
}
const s3Storage: CardPrintStorage = {
  async write({ key, body, contentType }) {
    const { client, bucket } = configured();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body,
      ContentType: contentType, CacheControl: 'no-store', IfNoneMatch: '*' }));
  },
  async read(key) {
    const { client, bucket } = configured();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new NotFoundError('Card print export');
    return object.Body.transformToByteArray();
  },
};
let active = s3Storage;
export const cardPrintStorage = () => active;
export function useCardPrintStorage(storage: CardPrintStorage) {
  const previous = active;
  active = storage;
  return () => { active = previous; };
}
