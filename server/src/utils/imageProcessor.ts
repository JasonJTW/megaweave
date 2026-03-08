import sharp from "sharp";

/**
 * Utility for processing images on the backend using 'sharp'.
 */
export const imageProcessor = {
  /**
   * Process user avatar:
   * - Resize to 400x400 (cover)
   * - Convert to webp for better compression
   */
  async processAvatar(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toBuffer();
  },

  /**
   * Process post images:
   * - Standardize max width to 1200px
   * - Convert to webp
   */
  async processPostImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1200, null, {
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: 85 })
      .toBuffer();
  },

  /**
   * Create thumbnail for post images:
   * - Resize to 300x300 (cover)
   * - Convert to webp
   */
  async createThumbnail(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(300, 300, {
        fit: "cover",
      })
      .webp({ quality: 70 })
      .toBuffer();
  },
};
