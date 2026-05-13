import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Second Brain — AI Learning Platform",
    template: "%s | Second Brain",
  },
  description:
    "Your personalized Harvard-level AI professor. Upload any material and transform it into structured reviewers, adaptive quizzes, flashcards, and an intelligent tutor — all powered by Claude.",
  keywords: ["AI tutor", "learning platform", "second brain", "flashcards", "study tool", "board exam", "AI professor"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${jakartaSans.variable} min-h-screen bg-app font-sans antialiased`}>{children}</body>
    </html>
  );
}
