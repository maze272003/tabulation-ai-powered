import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">Tabulation</h1>
      <p className="text-muted-foreground">Competition management and tabulation platform.</p>
      <Link href="/sign-in" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">Sign in</Link>
    </main>
  );
}
