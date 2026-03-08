import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'react-hot-toast'
import Navbar from '@/components/layout/Navbar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })

export const metadata: Metadata = {
  title: 'TraffixAI - AI-Powered Smart Traffic Surveillance & Accident Response',
  description: 'Advanced AI-based smart traffic surveillance, real-time accident detection, and intelligent response system powered by YOLOv8 deep learning.',
  keywords: 'traffic surveillance, accident detection, AI traffic management, smart city, CCTV monitoring',
  authors: [{ name: 'TraffixAI Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#030712',
  openGraph: {
    title: 'TraffixAI - AI-Powered Traffic Surveillance',
    description: 'Real-time AI traffic monitoring and accident response system',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-dark-900 text-white antialiased`}>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
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
