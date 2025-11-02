// app/api/og/route.ts
import { ImageResponse } from "next/og";
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response("Missing id parameter", { status: 400 });
    }

    // 使用 await 直接等待 fetch 完成
    const response = await fetch(`${hostName}/api/posts/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch post: ${response.status}`);
    }

    const data = await response.json();
    const post = data.post;
    const image_url = post.image_urls?.split(",")[0];
    const defaultImage =
      "data:image/png;base64,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";
    // 建立 Open Graph 圖像
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg,#1db954,#121212)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: 60,
            fontFamily: "sans-serif",
          }}
        >
          <img
            src={image_url || defaultImage}
            width="400"
            height="400"
            style={{ borderRadius: 16, display: "flex" }}
          />
          <div style={{ marginTop: 20, display: "flex" }}>
            {post.title || "NO TITLE"}
          </div>
          <div style={{ fontSize: 30, opacity: 0.8, display: "flex" }}>
            by {post.username || "unknown"}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (error) {
    console.error("OG image generation error:", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
