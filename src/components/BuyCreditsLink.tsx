import Link from "next/link";
import type { ReactNode } from "react";

type BuyCreditsLinkProps = {
  children: ReactNode;
  className?: string;
};

/** Unconditional link to the buy-credits page — never balance-dependent. */
export default function BuyCreditsLink({
  children,
  className,
}: BuyCreditsLinkProps) {
  return (
    <Link href="/buy-credits" prefetch={false} className={className}>
      {children}
    </Link>
  );
}
