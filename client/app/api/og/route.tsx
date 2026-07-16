// app/api/og/route.ts
import { ImageResponse } from "next/og";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export async function GET(req: Request) {
  try {
    const fontPath = path.join(
      process.cwd(),
      "app/api/og/D-DIN-PRO-600-SemiBold.otf",
    );
    const fontData = await fs.readFile(fontPath);

    const fontPath400 = path.join(
      process.cwd(),
      "app/api/og/D-DIN-PRO-400-Regular.otf",
    );
    const fontData400 = await fs.readFile(fontPath400);

    const shareSvgPath = path.join(
      process.cwd(),
      "public/assets/PostShareShare.svg",
    );
    const wishSvgPath = path.join(
      process.cwd(),
      "public/assets/PostShareWish.svg",
    );
    const commonsSvgPath = path.join(
      process.cwd(),
      "public/assets/PostShareWeaving.svg",
    );

    const resolvedHeaders = {
      share: await fs.readFile(shareSvgPath),
      wish: await fs.readFile(wishSvgPath),
      commons: await fs.readFile(commonsSvgPath),
    };

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response("Missing id parameter", { status: 400 });
    }

    const response = await fetch(`${hostName}/api/posts/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch post: ${response.status}`);
    }

    const data = await response.json();
    const post = data.post;

    // Image logic matching PostShareModal
    const imageUrls = post.image_urls
      ? post.image_urls.split(",").filter(Boolean)
      : [];
    const thumbnailUrls = post.thumbnail_urls
      ? post.thumbnail_urls.split(",").filter(Boolean)
      : [];
    const imageSrc = thumbnailUrls[0] || imageUrls[0];

    // Fetch and convert WebP to PNG using sharp directly to bypass Satori's WebP limitations
    let finalImageSrc = "";
    if (imageSrc) {
      try {
        const imageResponse = await fetch(imageSrc);
        if (imageResponse.ok) {
          const arrayBuffer = await imageResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const pngBuffer = await sharp(buffer).png().toBuffer();
          finalImageSrc = `data:image/png;base64,${pngBuffer.toString("base64")}`;
        } else {
          console.error("Failed to fetch image:", imageResponse.status);
        }
      } catch (err) {
        console.error("Failed to convert image with sharp:", err);
      }
    }

    // Header logic
    const headerBuffer =
      resolvedHeaders[post.type as "share" | "wish" | "commons"] ||
      resolvedHeaders.share;
    const headerBase64 = Buffer.from(headerBuffer).toString("base64");
    const headerSrc = `data:image/svg+xml;base64,${headerBase64}`;

    // Location matching
    const locationText =
      [post.province, post.city, post.route].filter(Boolean).join("") ||
      post.full_address ||
      "";

    // Tags matching
    const tags = post.tags
      ? post.tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];

    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#c4d0c2",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
        }}
      >
        {/* Card Wrapper */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "600px",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          }}
        >
          {/* Header SVG banner */}
          <img
            alt={""}
            src={headerSrc}
            style={{
              display: "flex",
              width: "600px",
              height: "244.4px",
            }}
          />

          {/* White Body Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "white",
              padding: "40px",
              borderBottomLeftRadius: "80px",
              borderBottomRightRadius: "80px",
            }}
          >
            {/* Image Container with Badges */}
            <div
              style={{
                display: "flex",
                position: "relative",
                width: "520px",
                height: "520px",
                borderRadius: "20px",
                backgroundColor: "rgba(234, 235, 230, 0.3)",
              }}
            >
              {finalImageSrc ? (
                <img
                  alt={""}
                  src={finalImageSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "20px",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(59, 98, 50, 0.75)",
                    fontSize: "28px",
                    fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                  }}
                >
                  No image
                </div>
              )}

              {/* Badges Overlay */}
              <div
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: "20px",
                  right: "20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {/* Views Badge */}
                {post.view_count > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      backgroundColor: "#7c7c7c",
                      padding: "6px 16px",
                      borderRadius: "20px",
                    }}
                  >
                    {/* EyesIcon SVG path */}
                    <svg
                      width="24"
                      height="14"
                      viewBox="0 0 18 10"
                      fill="none"
                      style={{ marginRight: "8px", display: "flex" }}
                    >
                      <path
                        d="M13.0684 0C15.792 1.19499e-07 18 2.2266 18 4.9502C17.9999 7.6737 15.7919 9.90039 13.0684 9.90039C11.3785 9.90035 9.88762 9.04244 8.99902 7.74121C8.11036 9.04193 6.62115 9.90034 4.93164 9.90039C2.20811 9.90039 0.000105796 7.6737 0 4.9502C1.18607e-07 2.2266 2.20805 -1.19499e-07 4.93164 0C6.62068 4.76145e-05 8.11027 0.857109 8.99902 2.15723C9.88771 0.856599 11.3789 4.13533e-05 13.0684 0Z"
                        fill="white"
                      />
                      <rect
                        x="7.10156"
                        y="1.73242"
                        width="6.435"
                        height="6.41095"
                        rx="3.20548"
                        transform="rotate(90 7.10156 1.73242)"
                        fill="#333333"
                      />
                      <rect
                        x="15.2876"
                        y="1.73242"
                        width="6.435"
                        height="6.41095"
                        rx="3.20548"
                        transform="rotate(90 15.2876 1.73242)"
                        fill="#333333"
                      />
                    </svg>
                    <span
                      style={{
                        color: "white",
                        fontSize: "24px",
                        fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                      }}
                    >
                      {post.view_count}
                    </span>
                  </div>
                )}

                {/* Condition Badge */}
                {post.condition_name && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      backgroundColor: "#f5f4f3",
                      padding: "6px 20px",
                      borderRadius: "20px",
                    }}
                  >
                    <span
                      style={{
                        color: "black",
                        fontSize: "14px",
                        fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                        fontWeight: 400,
                      }}
                    >
                      {post.condition_name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div
              style={{
                marginTop: "32px",
                fontSize: "48px",
                fontWeight: 600,
                color: "#111827",
                fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                display: "block",
              }}
            >
              {post.title || "NO TITLE"}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div
                style={{
                  marginTop: "20px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                {tags.map((tag: string) => (
                  <div
                    key={tag}
                    style={{
                      display: "flex",
                      backgroundColor: "#eaebe6",
                      padding: "8px 16px",
                      borderRadius: "16px",
                    }}
                  >
                    <span
                      style={{
                        color: "#23361A",
                        fontSize: "26px",
                        fontWeight: 500,
                        fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                      }}
                    >
                      #{tag}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Location */}
            {locationText && (
              <div
                style={{
                  marginTop: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* LocationIcon SVG path */}
                <svg
                  width="24"
                  height="30"
                  viewBox="0 0 12 15"
                  fill="none"
                  style={{ color: "#3b6232", flexShrink: 0, display: "flex" }}
                >
                  <path
                    d="M6.39998 0H5.60002C2.50727 0 0 2.50778 0 5.60114V6.40127C0 7.94209 0.969988 9.4245 1.97654 10.4372L5.65604 14.4927C5.81155 14.6527 6.06795 14.6544 6.22571 14.4966L10.0871 10.4605C11.1075 9.44595 12 7.95395 12 6.40112V5.601C12 2.50778 9.49287 0 6.39998 0Z"
                    fill="currentColor"
                  />
                  <path
                    d="M6.1638 3.28711H5.82066C4.49369 3.28711 3.41797 4.36283 3.41797 5.6898V6.03294C3.41797 7.3599 4.49369 8.43562 5.82066 8.43562H6.1638C7.49076 8.43562 8.56648 7.3599 8.56648 6.03294V5.6898C8.56648 4.36283 7.49076 3.28711 6.1638 3.28711Z"
                    fill="white"
                  />
                </svg>
                <span
                  style={{
                    fontSize: "26px",
                    color: "#374151",
                    fontFamily: "D-DIN-PRO, 'PingFang TC', sans-serif",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    display: "flex",
                  }}
                >
                  {locationText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>,
      {
        width: 630,
        height: 1200,
        fonts: [
          {
            name: "D-DIN-PRO",
            data: fontData,
            style: "normal",
            weight: 600,
          },
          {
            name: "D-DIN-PRO",
            data: fontData400,
            style: "normal",
            weight: 400,
          },
        ],
      },
    );
  } catch (error) {
    console.error("OG image generation error:", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
