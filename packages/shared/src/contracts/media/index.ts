import { z } from 'zod';

/**
 * Media uploads — currently only a photograph of a found item.
 *
 * The file never passes through the API. The client asks for a presigned S3
 * POST, uploads straight to the bucket, and sends back the key. That keeps a
 * multi-megabyte phone photo off a request path sized for 100 KB of JSON, and
 * off an instance that is meant to be answering booth taps.
 *
 * Three constraints are signed into the policy rather than trusted from the
 * client: the key (server-generated, never user-supplied), the content type
 * (images only), and a size ceiling. A presigned URL that let the caller choose
 * its own key would let one volunteer overwrite another's photo.
 *
 * PRODUCT_BRIEF §7.2 still applies: this photographs an object, never a person.
 */

export const UploadPurpose = z.enum(['lostFound']);
export type UploadPurpose = z.infer<typeof UploadPurpose>;

/** Formats every phone camera produces, and nothing else. */
export const UploadContentType = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type UploadContentType = z.infer<typeof UploadContentType>;

export const CreateUploadRequest = z
  .object({
    purpose: UploadPurpose,
    contentType: UploadContentType,
    /**
     * Declared size, checked against the ceiling before a URL is issued so an
     * oversized file fails immediately rather than after a slow upload over
     * hall wifi. The signed policy enforces it again at S3.
     */
    contentLength: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();
export type CreateUploadRequest = z.infer<typeof CreateUploadRequest>;

export const CreateUploadResponse = z
  .object({
    /** Where to POST the multipart form. */
    url: z.url(),
    /** Form fields to send before the file part, in this order. */
    fields: z.record(z.string(), z.string()),
    /** Store this on the record once the upload succeeds. */
    key: z.string(),
    /** Seconds the presigned policy stays valid. */
    expiresIn: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
  })
  .strict();
export type CreateUploadResponse = z.infer<typeof CreateUploadResponse>;

/**
 * A short-lived read URL. Issued per request rather than stored, because a
 * permanent public URL to an item photo is a permanent public URL to an item
 * photo — findable long after the event, by anyone who ever saw the link.
 */
export const MediaUrlResponse = z
  .object({
    url: z.url(),
    expiresIn: z.number().int().positive(),
  })
  .strict();
export type MediaUrlResponse = z.infer<typeof MediaUrlResponse>;
