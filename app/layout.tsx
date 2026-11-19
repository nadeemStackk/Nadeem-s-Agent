import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Ask Nadeem — AI Assistant",
  description: "Chat or talk with an AI assistant that knows about Nadeem's skills, projects and experience.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
