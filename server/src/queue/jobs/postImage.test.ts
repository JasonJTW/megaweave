import type { Job } from "bullmq";
import { defaultImageStorage } from "../../storage/ImageStorage";
import { processPostUploadImages, PostUploadImageJobData } from "./postImage";

jest.mock("../../storage/ImageStorage", () => ({
  defaultImageStorage: {
    getObjectBuffer: jest.fn(),
    upload: jest.fn(),
    delete: jest.fn(),
  },
}));

const storage = defaultImageStorage as jest.Mocked<typeof defaultImageStorage>;

function makeJob(count: number): Job<PostUploadImageJobData> {
  return {
    data: {
      postId: 1,
      files: Array.from({ length: count }, (_, i) => ({
        s3Key: `posts/1/image-${i}.webp`,
        stagingKey: `staging/posts/1-${i}.jpg`,
      })),
    },
    log: jest.fn().mockResolvedValue(0),
  } as unknown as Job<PostUploadImageJobData>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("processPostUploadImages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    storage.upload.mockResolvedValue(undefined as never);
    storage.delete.mockResolvedValue(undefined as never);
  });

  it("uploads every image and deletes its staging object", async () => {
    storage.getObjectBuffer.mockResolvedValue(Buffer.from("not-an-image"));

    await processPostUploadImages(makeJob(5));

    expect(storage.upload.mock.calls.map(([, folder, name]) => `${folder}/${name}`).sort()).toEqual(
      [0, 1, 2, 3, 4].map((i) => `posts/1/image-${i}.webp`),
    );
    expect(storage.delete.mock.calls.map(([keys]) => keys[0]).sort()).toEqual(
      [0, 1, 2, 3, 4].map((i) => `staging/posts/1-${i}.jpg`),
    );
  });

  it("processes images of one job concurrently, up to three at a time", async () => {
    let active = 0;
    let peak = 0;
    storage.getObjectBuffer.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(20);
      active--;
      return Buffer.from("not-an-image");
    });

    await processPostUploadImages(makeJob(5));

    expect(peak).toBe(3);
  });

  it("finishes the other images before failing the job for a retry", async () => {
    storage.getObjectBuffer.mockImplementation(async (key: string) => {
      if (key.endsWith("-0.jpg")) throw new Error("S3 unavailable");
      await delay(20);
      return Buffer.from("not-an-image");
    });

    await expect(processPostUploadImages(makeJob(3))).rejects.toThrow("S3 unavailable");
    expect(storage.upload).toHaveBeenCalledTimes(2);
  });
});
