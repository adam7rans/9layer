'use client';

import dynamic from 'next/dynamic';

// Dynamically import the Player component with SSR disabled
const Player = dynamic(() => import('@/components/Player'), { 
  ssr: false 
});

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Music Player</h1>
          <p className="text-gray-600">A modern web interface for your music collection</p>
        </header>
        
        <div className="bg-white rounded-xl shadow-md p-6">
          <Player />
        </div>
        
        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>Music Player v2 - Built with Next.js and TypeScript</p>
        </footer>
      </div>
    </main>
  );
}
