import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-zinc-100">
      <Image
        src="/equiform-logo.png"
        alt="EquiForm"
        width={600}
        height={600}
        priority
        className="object-contain"
      />
      <p className="mt-3 max-w-md text-center text-sm text-zinc-400">
        AI-powered equine conformation analysis from a single side profile photo
      </p>
      <Link
        href="/analyze"
        className="mt-10 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-accent-hover"
      >
        Analyze a Horse
      </Link>
      <p className="mt-8 text-xs text-zinc-600">
        AQHA-style conformation scoring with landmark overlay
      </p>
    </div>
  );
}
