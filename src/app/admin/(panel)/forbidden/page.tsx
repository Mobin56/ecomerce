import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted">Ask a Super Admin to update your role permissions.</p>
        <Link href="/admin" className="mt-4 inline-block text-sm font-semibold underline">Back to dashboard</Link>
      </div>
    </div>
  );
}
