import { useEffect, useRef } from 'react';
import type { CardType } from '@meobom/engine';
import { faceTexture, loadCardFonts } from '../game/cardArt';

const FAN: CardType[] = ['snip', 'hiss', 'fuse', 'pounce', 'peek'];

/** A little fan of real card faces for the home screen, drawn with the same painter as the 3D cards. */
export function CardFan() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void loadCardFonts().then(() => {
      if (!alive || !ref.current) return;
      ref.current.innerHTML = '';
      FAN.forEach((t, i) => {
        const img = faceTexture(t, 1).image as HTMLCanvasElement;
        const el = document.createElement('img');
        el.src = img.toDataURL();
        el.alt = '';
        el.style.setProperty('--r', `${(i - 2) * 11}deg`);
        el.style.setProperty('--y', `${Math.abs(i - 2) * 10}px`);
        ref.current!.append(el);
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return <div className="cardfan" ref={ref} aria-hidden="true" />;
}
