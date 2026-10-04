export interface MediaStorageLocation {
  bucket?: string;
  region: string;
}

const DNS_BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const COMMERCIAL_REGION = /^(?!cn-)[a-z]{2}-(?:[a-z]+-)+[1-9]\d*$/;

/** One regional origin for DNS-compatible buckets; never an operator-supplied URL or wildcard. */
export function mediaObjectOrigin({ bucket, region }: MediaStorageLocation): string | null {
  if (!bucket) return null;
  if (!DNS_BUCKET.test(bucket) || !COMMERCIAL_REGION.test(region))
    throw new Error('Media storage requires an undotted DNS bucket and a commercial AWS region');
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}
