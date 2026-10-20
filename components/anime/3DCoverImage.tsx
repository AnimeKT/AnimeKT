'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';

type GlareStyle = CSSProperties & {
  '--gx'?: string;
  '--gy'?: string;
};

type ThreeDCoverImageProps = {
  src: string;
  alt: string;
};

export default function ThreeDCoverImage({ src, alt }: ThreeDCoverImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState('');
  const [glareStyle, setGlareStyle] = useState<GlareStyle>({});

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const percentX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const percentY = ((event.clientY - bounds.top) / bounds.height) * 100;
    const rotateY = (percentX - 50) / 2;
    const rotateX = -(percentY - 50) / 2;

    setTransformStyle(
      `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
    );
    setGlareStyle({ '--gx': `${percentX}%`, '--gy': `${percentY}%`, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(800px) rotateX(0deg) rotateY(0deg)');
    setGlareStyle({ '--gx': '50%', '--gy': '50%', opacity: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative h-full w-full overflow-hidden rounded-xl shadow-2xl transition-transform duration-200 ease-out"
      style={{ transform: transformStyle }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes="(max-width: 768px) 256px, 320px"
        className="h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200"
        style={{
          ...glareStyle,
          background:
            'radial-gradient(farthest-corner circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%)',
        }}
      />
    </div>
  );
}
