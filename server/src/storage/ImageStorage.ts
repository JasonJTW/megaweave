import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

export type ImageSize = "thumb" | "medium" | "original";

export interface ImageStorage {
  upload(
    buffer: Buffer,
    folder: string,
    fileName: string,
    contentType?: string
  ): Promise<{ key: string; url: string }>;
  delete(fileKeys: string[]): Promise<void>;
  getUrl(s3Key?: string | null, size?: ImageSize): string;
}

export class S3ImageStorage implements ImageStorage {
  private s3Client: S3Client;
  private bucketName: string;
  private destinationBucket: string;
  private cloudfrontUrl: string;

  constructor() {
    this.bucketName = process.env.BUCKET_NAME || "";
    this.destinationBucket = process.env.DESTINATION_BUCKET || "megaweave-thumbnails";
    this.cloudfrontUrl = process.env.CLOUDFRONT_URL || "";

    this.s3Client = new S3Client({
      region: process.env.BUCKET_REGION,
      credentials: {
        accessKeyId: process.env.ACCESS_KEY || "",
        secretAccessKey: process.env.SECRET_ACCESS_KEY || "",
      },
    });
  }

  async upload(
    buffer: Buffer,
    folder: string,
    fileName: string,
    contentType: string = "image/webp"
  ): Promise<{ key: string; url: string }> {
    const key = `${folder}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return {
      key,
      url: this.getUrl(key, "original"),
    };
  }

  async delete(fileKeys: string[]): Promise<void> {
    if (!this.bucketName) {
      console.error("S3ImageStorage.delete: BUCKET_NAME not set");
      return;
    }
    if (!fileKeys || fileKeys.length === 0) return;

    const deletePromises = fileKeys.map(async (key) => {
      try {
        const targetBucket = key.startsWith("thumbnails/")
          ? this.destinationBucket
          : this.bucketName;
        const deleteCommand = new DeleteObjectCommand({
          Bucket: targetBucket,
          Key: key,
        });
        await this.s3Client.send(deleteCommand);
        console.log(`Successfully deleted from ${targetBucket}: ${key}`);
      } catch (error) {
        console.error(`Failed to delete ${key}:`, error);
      }
    });

    await Promise.all(deletePromises);
  }

  getUrl(s3Key?: string | null, size: ImageSize = "original"): string {
    if (!s3Key) return "";
    if (size === "original") {
      return this.cloudfrontUrl ? `${this.cloudfrontUrl}/${s3Key}` : s3Key;
    }

    const segments = s3Key.split("/");
    const category = segments[0];
    const rest = segments.slice(1);
    const filename = (rest[rest.length - 1] ?? s3Key).replace(/\.[^.]+$/, ".webp");
    const subDirs = rest.slice(0, -1);

    const thumbKey = ["thumbnails", category, size, ...subDirs, filename].join("/");
    return this.cloudfrontUrl ? `${this.cloudfrontUrl}/${thumbKey}` : thumbKey;
  }
}

export class InMemoryImageStorage implements ImageStorage {
  private storage = new Map<string, Buffer>();
  public baseUrl: string;

  constructor(baseUrl: string = "https://cdn.example.com") {
    this.baseUrl = baseUrl;
  }

  async upload(
    buffer: Buffer,
    folder: string,
    fileName: string
  ): Promise<{ key: string; url: string }> {
    const key = `${folder}/${fileName}`;
    this.storage.set(key, buffer);
    return {
      key,
      url: this.getUrl(key, "original"),
    };
  }

  async delete(fileKeys: string[]): Promise<void> {
    for (const key of fileKeys) {
      this.storage.delete(key);
    }
  }

  getUrl(s3Key?: string | null, size: ImageSize = "original"): string {
    if (!s3Key) return "";
    if (size === "original") {
      return `${this.baseUrl}/${s3Key}`;
    }

    const segments = s3Key.split("/");
    const category = segments[0];
    const rest = segments.slice(1);
    const filename = (rest[rest.length - 1] ?? s3Key).replace(/\.[^.]+$/, ".webp");
    const subDirs = rest.slice(0, -1);

    const thumbKey = ["thumbnails", category, size, ...subDirs, filename].join("/");
    return `${this.baseUrl}/${thumbKey}`;
  }

  hasFile(key: string): boolean {
    return this.storage.has(key);
  }
}

export const defaultImageStorage = new S3ImageStorage();
