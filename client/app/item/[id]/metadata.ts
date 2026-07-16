import { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const res = await fetch(`${hostName}/api/posts/${id}`);
  const data = await res.json();
  const post = data.post;
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
          width: 630,
          height: 1200,
          alt: title,
        },
      ],
    },
  };
}
