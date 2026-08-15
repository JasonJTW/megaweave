// server/src/scripts/seedFacebookPosts.ts
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";

// Load development environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.development") });

/// <reference types="multer" />

import { postService } from "../services/postService";
import type { PostType } from "../types/post";

interface RawFacebookPost {
  index: string;
  author: string;
  title: string;
  content: string;
  link: string;
  images: string[];
  type: "share" | "wish" | "commons";
  category: string;
  condition: string;
}

// Configuration constants
const BOT_USER_ID = 59; // Default post author ID (e.g., admin or bot user)
const HOME_DIR = os.homedir(); // System home directory

/**
 * Ensures title satisfies Zod schema constraints: min(5), max(60).
 * If length is already sufficient (5-60 chars), returns original title as-is.
 */
function sanitizeTitle(post: RawFacebookPost): string {
  let title = (post.title || "").trim();

  // If title is within valid length, keep it directly without modifications
  if (title.length >= 5 && title.length <= 60) {
    return title;
  }

  // If title is too short (< 5 characters), fallback to clean content or default title
  if (title.length < 5) {
    const cleanContent = post.content.replace(/\r?\n|\r/g, " ").trim();
    if (cleanContent.length >= 5) {
      title = cleanContent.slice(0, 60);
    } else {
      title = `${title} - Facebook Post`.trim();
      if (title.length < 5) {
        title = "Facebook Imported Post";
      }
    }
  }

  // If title exceeds 60 characters, truncate it
  if (title.length > 60) {
    title = title.slice(0, 57) + "...";
  }

  return title;
}

/**
 * Ensures content length is within 3 ~ 1000 characters and appends attribution & disclaimer footer.
 * If content length is already sufficient, keeps original content without modification.
 */
function sanitizeContent(post: RawFacebookPost): string {
  const footer = `\n\n---\nAuthor: ${post.author}\nOriginal Post: ${post.link}\nThis content is reposted from Facebook by @megaweaving. In case of any discrepancies, the original Facebook post shall prevail.`;
  let content = (post.content || "").trim();

  // If content is too short (< 3 characters), fallback to title or default text
  if (content.length < 3) {
    content =
      post.title && post.title.trim().length >= 3
        ? post.title.trim()
        : "Please refer to the images and original link for more details.";
  }

  // Ensure content + footer does not exceed 1000 characters
  const maxContentLength = 1000 - footer.length;
  if (content.length > maxContentLength) {
    content = content.slice(0, maxContentLength - 3) + "...";
  }

  return content + footer;
}

/**
 * Resolves the absolute local file path for an image relative to posts.json directory.
 */
function resolveImagePath(imgRelPath: string, baseDir: string): string | null {
  const resolved = path.resolve(baseDir, imgRelPath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  // Fallback in case path starts with ~/ or is already absolute
  const fallbackPaths = [
    imgRelPath.startsWith("~")
      ? path.join(HOME_DIR, imgRelPath.slice(1))
      : null,
    path.join(HOME_DIR, imgRelPath),
    path.resolve(process.cwd(), imgRelPath),
  ].filter(Boolean) as string[];

  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

async function seedFacebookPosts() {
  // Search for posts.json path
  const postsJsonPaths = [
    process.argv[2], // Allows passing path via CLI: npx tsx seedFacebookPosts.ts <path>
    path.resolve(process.cwd(), "posts.json"),
    path.resolve(process.cwd(), "..", "posts.json"),
    path.join(HOME_DIR, "megaweavingFB", "posts.json"),
  ].filter(Boolean) as string[];

  let postsDataPath = "";
  for (const p of postsJsonPaths) {
    if (fs.existsSync(p)) {
      postsDataPath = p;
      break;
    }
  }

  if (!postsDataPath) {
    console.error(
      "❌ Could not find posts.json. Please place posts.json in root or pass it as an argument.",
    );
    console.error(
      "Usage: npx tsx server/src/scripts/seedFacebookPosts.ts /path/to/posts.json",
    );
    process.exit(1);
  }

  const postsDir = path.dirname(postsDataPath);
  console.log(`📖 Loading posts from: ${postsDataPath}`);
  console.log(`📂 Base directory for images: ${postsDir}`);
  const rawPosts: RawFacebookPost[] = JSON.parse(
    fs.readFileSync(postsDataPath, "utf-8"),
  );
  console.log(`📊 Found ${rawPosts.length} posts to import\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < rawPosts.length; i++) {
    const post = rawPosts[i];
    const postIndex = post.index || `${i}`;
    console.log(`--------------------------------------------------`);
    console.log(
      `[${i + 1}/${rawPosts.length}] Processing Post Index: ${postIndex} (Author: ${post.author})`,
    );

    const title = sanitizeTitle(post);
    const content = sanitizeContent(post);
    const categoryId = parseInt(post.category, 10);
    const conditionLevel = parseInt(post.condition, 10);
    const type = (
      ["share", "wish", "commons"].includes(post.type) ? post.type : "share"
    ) as PostType;

    // Image handling: Copy to OS temp directory to avoid Worker unlinking the original file after S3 upload
    const mockFiles: Express.Multer.File[] = [];
    if (Array.isArray(post.images) && post.images.length > 0) {
      for (const imgRelPath of post.images) {
        const srcPath = resolveImagePath(imgRelPath, postsDir);
        if (!srcPath) {
          console.warn(`  ⚠️ Image file not found: ${imgRelPath}`);
          continue;
        }

        try {
          const tempFileName = `fb_seed_${Date.now()}_${Math.random().toString(36).slice(2)}_${path.basename(srcPath)}`;
          const tempDestPath = path.join(os.tmpdir(), tempFileName);
          await fs.promises.copyFile(srcPath, tempDestPath);

          mockFiles.push({
            fieldname: "images",
            originalname: path.basename(srcPath),
            encoding: "7bit",
            mimetype: "image/jpeg",
            destination: os.tmpdir(),
            filename: tempFileName,
            path: tempDestPath,
            size: (await fs.promises.stat(tempDestPath)).size,
          } as Express.Multer.File);
        } catch (copyErr) {
          console.error(
            `  ⚠️ Failed to copy image to temp directory (${srcPath}):`,
            copyErr,
          );
        }
      }
    }

    // Calculate expiration date (+14 days from execution time)
    const expiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      // Directly call postService.createPost
      const createdPost = await postService.createPost(
        BOT_USER_ID,
        {
          title,
          content,
          type,
          categoryId,
          conditionLevel,
          status: "active",
          expiresAt,
        },
        mockFiles.length > 0 ? mockFiles : undefined,
      );

      console.log(`  ✅ Successfully created post ID: ${createdPost.id}`);
      console.log(`     Title: ${title}`);
      console.log(
        `     Category: ${categoryId}, Condition: ${conditionLevel}, Images: ${mockFiles.length}`,
      );
      successCount++;
    } catch (err) {
      console.error(`  ❌ Failed to create post:`, err);
      failCount++;
    }
  }

  console.log(`==================================================`);
  console.log(
    `🎉 Import completed! Succeeded: ${successCount}, Failed: ${failCount}`,
  );
  process.exit(0);
}

seedFacebookPosts().catch((err) => {
  console.error("💥 Unexpected error occurred during execution:", err);
  process.exit(1);
});
