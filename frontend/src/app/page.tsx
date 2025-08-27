'use client';

import dynamic from 'next/dynamic';

// Dynamically import the IntegratedPlayer component with SSR disabled
const IntegratedPlayer = dynamic(() => import('@/components/IntegratedPlayer'), { 
  ssr: false 
});

export default function Home() {
  return (
    <IntegratedPlayer />
  );
}
