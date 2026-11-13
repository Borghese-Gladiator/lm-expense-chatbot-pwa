import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ColorSchemeScript, MantineProvider, createTheme, mantineHtmlProps } from "@mantine/core";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import { Notifications } from "@mantine/notifications";

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232a78d6'/%3E%3Ctext x='16' y='21.5' font-family='system-ui,sans-serif' font-size='15' font-weight='700' fill='white' text-anchor='middle'%3ESL%3C/text%3E%3C/svg%3E";

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  defaultRadius: "md",
});

export const metadata: Metadata = { title: "Spend Lens", icons: { icon: ICON } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
