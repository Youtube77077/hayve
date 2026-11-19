import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { Config } from './config.js';
import { AVATAR_MAX_BYTES, type AvatarType } from './images.js';

/**
 * DigitalOcean Spaces (S3 compatible) with CDN. Only URLs are stored in the database.
 * Clients upload straight to Spaces with a short-lived presigned POST whose policy
 * enforces the content type and the 5 MB limit; the API then re-checks the bytes.
 */
export class Storage {
  private s3: S3Client;
  constructor(private c: Config) {
    this.s3 = new S3Client({ endpoint: c.SPACES_ENDPOINT, region: c.SPACES_REGION, credentials: { accessKeyId: c.SPACES_KEY!, secretAccessKey: c.SPACES_SECRET! }, forcePathStyle: false });
  }

  presignAvatarUpload(key: string, contentType: AvatarType) {
    return createPresignedPost(this.s3, {
      Bucket: this.c.SPACES_BUCKET!,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': contentType, acl: 'private' },
      Conditions: [
        ['content-length-range', 1, AVATAR_MAX_BYTES],
        ['eq', '$Content-Type', contentType],
        ['eq', '$acl', 'private'],
      ],
    });
  }

  async read(key: string, maxBytes: number): Promise<Uint8Array> {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.c.SPACES_BUCKET!, Key: key }));
    if ((out.ContentLength ?? 0) > maxBytes) throw new Error('too large');
    return out.Body!.transformToByteArray();
  }

  async putPublic(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.c.SPACES_BUCKET!, Key: key, Body: body, ContentType: contentType, ACL: 'public-read', CacheControl: 'public, max-age=31536000, immutable' }));
    return `${this.c.SPACES_CDN_URL!.replace(/\/$/, '')}/${key}`;
  }

  async remove(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.c.SPACES_BUCKET!, Key: key })).catch(() => {});
  }

  keyFromUrl(url: string) {
    const base = `${this.c.SPACES_CDN_URL!.replace(/\/$/, '')}/`;
    return url.startsWith(base) ? url.slice(base.length) : null;
  }
}
