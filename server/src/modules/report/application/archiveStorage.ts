import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../../config/env.js';
import { NotFoundError, ServiceUnavailableError } from '../../../platform/errors/index.js';

export const ARCHIVE_WORKBOOK_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface ArchiveStorage {
  write(input: { key: string; body: Buffer }): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}
const configured = () => {
  if (!env.S3_EXPORTS_BUCKET)
    throw new ServiceUnavailableError(
      'Export storage is not configured. Contact the platform administrator.',
    );
  return { client: new S3Client({ region: env.AWS_REGION }), bucket: env.S3_EXPORTS_BUCKET };
};
const s3Archive: ArchiveStorage = {
  async write(input) {
    const { client, bucket } = configured();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        IfNoneMatch: '*',
        ContentType: ARCHIVE_WORKBOOK_TYPE,
        CacheControl: 'no-store',
      }),
    );
  },
  async read(key) {
    const { client, bucket } = configured();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new NotFoundError('Final export pack');
    return object.Body.transformToByteArray();
  },
};
let active: ArchiveStorage = s3Archive;
export const archiveStorage = () => active;
export function useArchiveStorage(storage: ArchiveStorage) {
  const previous = active;
  active = storage;
  return () => {
    active = previous;
  };
}
