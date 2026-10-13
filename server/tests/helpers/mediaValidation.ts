/** Domain integration adapter only; real magic/decode/byte limits are covered by image validation units. */
export async function syntheticValidatedUpload(input: {
  key: string; contentType: string; contentLength?: number;
}) {
  return { objectKey: `${input.key}.validated`, objectVersionId: null, sourceEtag: '"synthetic-source"',
    sourceVersionId: null, contentType: input.contentType, contentLength: input.contentLength ?? 1000,
    sha256: 'a'.repeat(64) };
}
