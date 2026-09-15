import { defaultImageStorage, InMemoryImageStorage } from "./ImageStorage";

describe("ImageStorage Module Tests", () => {
  describe("InMemoryImageStorage", () => {
    const storage = new InMemoryImageStorage("https://cdn.megaweaving.net");

    it("should store buffer in memory and resolve original URL", async () => {
      const buffer = Buffer.from("fake-image-content");
      const { key, url } = await storage.upload(buffer, "posts", "test-1.webp");

      expect(key).toBe("posts/test-1.webp");
      expect(url).toBe("https://cdn.megaweaving.net/posts/test-1.webp");
      expect(storage.hasFile(key)).toBe(true);
    });

    it("should correctly resolve thumb, medium, and original variants", () => {
      const key = "posts/sub/photo.jpg";

      expect(storage.getUrl(key, "original")).toBe(
        "https://cdn.megaweaving.net/posts/sub/photo.jpg",
      );
      expect(storage.getUrl(key, "thumb")).toBe(
        "https://cdn.megaweaving.net/thumbnails/posts/thumb/sub/photo.webp",
      );
      expect(storage.getUrl(key, "medium")).toBe(
        "https://cdn.megaweaving.net/thumbnails/posts/medium/sub/photo.webp",
      );
    });

    it("should delete in-memory files", async () => {
      const buffer = Buffer.from("delete-me");
      const { key } = await storage.upload(buffer, "avatars", "user-1.jpg");

      expect(storage.hasFile(key)).toBe(true);
      await storage.delete([key]);
      expect(storage.hasFile(key)).toBe(false);
    });

    it("should generate mock presigned upload URL and retrieve buffer", async () => {
      const stagingKey = "staging/posts/mock-id.jpg";
      const presignedUrl = await storage.getPresignedUploadUrl(stagingKey, "image/jpeg");
      expect(presignedUrl).toBe(`https://cdn.megaweaving.net/mock-upload/${stagingKey}`);

      storage.setFile(stagingKey, Buffer.from("raw-image-bytes"));
      const retrieved = await storage.getObjectBuffer(stagingKey);
      expect(retrieved.toString()).toBe("raw-image-bytes");
    });
  });

  describe("S3ImageStorage URL resolution matching client imageUtils", () => {
    it("should return empty string for null or undefined key", () => {
      expect(defaultImageStorage.getUrl(null)).toBe("");
      expect(defaultImageStorage.getUrl(undefined)).toBe("");
    });
  });
});
