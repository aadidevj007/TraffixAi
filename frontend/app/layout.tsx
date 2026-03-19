import type { Metadata, Viewport } from 'next'
import { Lora } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'react-hot-toast'
import Navbar from '@/components/layout/Navbar'
import AppBackgroundVideo from '@/components/layout/AppBackgroundVideo'

const lora = Lora({ subsets: ['latin'], variable: '--font-lora' })

export const metadata: Metadata = {
  title: 'TraffixAI - AI-Powered Smart Traffic Surveillance & Accident Response',
  description: 'Advanced AI-based smart traffic surveillance, real-time accident detection, and intelligent response system powered by YOLOv8 deep learning.',
  keywords: 'traffic surveillance, accident detection, AI traffic management, smart city, CCTV monitoring',
  authors: [{ name: 'TraffixAI Team' }],
  openGraph: {
    title: 'TraffixAI - AI-Powered Traffic Surveillance',
    description: 'Real-time AI traffic monitoring and accident response system',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#030712',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${lora.variable} font-sans text-white antialiased`}>
        <AuthProvider>
          <AppBackgroundVideo />
          <Navbar />
          <main className="relative z-10">{children}</main>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid rgba(6,182,212,0.3)',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fff' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
