'use client';

import dynamic from 'next/dynamic';

// Dynamically import the Player component with SSR disabled
const Player = dynamic(() => import('@/components/Player'), { 
  ssr: false 
});

export default function Home() {
  return (
    <Player />
  );
}
