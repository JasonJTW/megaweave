import { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let post: any = null;
  try {
    const res = await fetch(`${hostName}/api/posts/${id}`);
    if (res.ok) {
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        post = data.post ?? null;
      }
    }
  } catch {
    // API unreachable or returned non-JSON — fall back to generic metadata
  }
  const description =
    post?.content?.slice(0, 100)?.replace(/\n/g, " ") ||
    "No description available";
  const title = post?.title
    ? `${post.title} | ${post.type} by ${post.username}`
    : "Untitled";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/item/${id}`,
      images: [
        {
          url: `${siteUrl}/api/og?id=${id}`,
          width: 900,
          height: 1200,
          alt: title,
        },
      ],
    },
  };
}
