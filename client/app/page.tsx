import Link from "next/link";
import ProductCart from "./components/ProductCard/ProductCard";

export default function Home() {
  return (
    <main>
      <h1>This is my next-app</h1>
      <div>
        <Link href="/users">user page</Link>
      </div>
      <div>
        <Link href="/signin">sign in page</Link>
      </div>
      <ProductCart />
    </main>
  );
}
