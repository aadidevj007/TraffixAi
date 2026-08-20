import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'react-hot-toast'
import Navbar from '@/components/layout/Navbar'
import AppBackgroundVideo from '@/components/layout/AppBackgroundVideo'
import PageTransition from '@/components/layout/PageTransition'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700', '800'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: 'TraffixAI — AI-Powered Smart Traffic Surveillance & Accident Response',
  description: 'Advanced AI-based smart traffic surveillance, real-time accident detection, and intelligent response system powered by YOLOv8 deep learning.',
  keywords: 'traffic surveillance, accident detection, AI traffic management, smart city, CCTV monitoring, YOLOv8, deep learning',
  authors: [{ name: 'TraffixAI Team' }],
  openGraph: {
    title: 'TraffixAI — AI-Powered Traffic Surveillance',
    description: 'Real-time AI traffic monitoring and accident response system',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020408',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} font-sans text-white antialiased`}>
        <AuthProvider>
          <AppBackgroundVideo />
          <Navbar />
          <main className="relative z-10">
            <PageTransition>{children}</PageTransition>
          </main>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgba(3, 7, 17, 0.95)',
                color: '#e0f7fa',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                backdropFilter: 'blur(20px)',
                fontFamily: 'var(--font-inter)',
              },
              success: {
                iconTheme: { primary: '#06b6d4', secondary: '#020408' },
              },
              error: {
                iconTheme: { primary: '#f59e0b', secondary: '#020408' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
