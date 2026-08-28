import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Mailiac | Deep Email Forensics & Threat Hunting',
  description: 'High-speed 11-stage asynchronous email forensics & multi-pillar threat analysis pipeline',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`scroll-smooth font-sans ${inter.variable}`}>
      <body className="antialiased bg-[#fdfcf8] text-[#1a1c1c]">
        {children}
      </body>
    </html>
  );
}

