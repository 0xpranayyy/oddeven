import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl font-semibold tracking-tighter text-faint">0%</p>
      <h1 className="mt-4 text-xl font-semibold">Chance this page exists</h1>
      <Link href="/" className="mt-6 inline-block text-brand">
        Back to markets →
      </Link>
    </div>
  );
}
