import { generateMetadata } from "./metadata";
import PostDetail from "./PostDetail";

export { generateMetadata };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 這裡可以選擇是否在 server 預抓資料
  // const res = await fetch(`${process.env.NEXT_PUBLIC_API_HOST}/api/posts/${params.id}`);
  // const { post } = await res.json();
  const { id } = await params;
  return <PostDetail postId={id} />;
}
