import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, themeScript } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "To Do",
  description: "A Microsoft To Do clone with a productivity dashboard.",
};

/**
 * Only what every route needs. The sidebar and the store live in the `(app)`
 * group instead, so the login screen isn't wrapped in a shell it can't use.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full overflow-hidden">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
