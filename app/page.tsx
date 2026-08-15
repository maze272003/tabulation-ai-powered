import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Tabulation</h1>
        <p className="max-w-md text-muted-foreground">
          Competition management and tabulation platform. Run events, score
          rounds, and rank participants — all in one place.
        </p>
      </div>
      <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
        Sign in
      </Button>
    </main>
  );
}
