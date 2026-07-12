"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The header logo link. Inside the admin panel it points to the admin
 * dashboard; everywhere else to the public home page.
 */
export function BrandLink({
  locale,
  className,
  children,
}: {
  locale: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const inAdmin = /^\/[a-z]{2}\/admin(\/|$)/.test(pathname);
  const href = inAdmin ? `/${locale}/admin` : `/${locale}`;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
