import { cookies } from "next/headers";

import AdminLoginGate from "./AdminLoginGate";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isAuthenticated =
    cookieStore.get("admin_session")?.value === "authenticated";

  if (!isAuthenticated) {
    return <AdminLoginGate />;
  }

  return <>{children}</>;
}
