import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { eventBus } from '@/lib/event-bus';
import type { WSEvent } from '@/types/ws-events';

interface FaceTrackOverlayProps {
  onClose: () => void;
}

export function FaceTrackOverlay({ onClose }: FaceTrackOverlayProps) {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const unsub = eventBus.subscribe((event: WSEvent) => {
      if (event.type === 'face_track') {
        setPos({ x: event.x, y: event.y });
      }
    });
    return unsub;
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-30">
      <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-accent bg-black/20">
        {/* Camera placeholder */}
        <div
          className="absolute h-12 w-12 rounded-full border-2 border-accent/60 transition-all duration-100"
          style={{
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
        <button
          onClick={onClose}
          className="absolute right-1 top-1 rounded-full bg-black/40 p-0.5 text-white hover:bg-black/60"
          aria-label="关闭摄像头"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
