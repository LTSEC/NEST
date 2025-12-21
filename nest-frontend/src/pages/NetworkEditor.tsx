import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { getGameById } from '../data/games';
import { useAuth } from '../providers/AuthProvider';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const NetworkEditor: React.FC = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const game = useMemo(() => (gameId ? getGameById(gameId) : undefined), [gameId]);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isDeveloper) {
      navigate('/');
    }
  }, [isDeveloper, navigate]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true);
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    offsetOrigin.current = { ...offset };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const deltaX = event.clientX - dragOrigin.current.x;
    const deltaY = event.clientY - dragOrigin.current.y;
    setOffset({ x: offsetOrigin.current.x + deltaX, y: offsetOrigin.current.y + deltaY });
  };

  const stopDragging = () => setDragging(false);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((current) => clamp(Number((current + direction).toFixed(2)), 0.5, 2));
  };

  const zoomIn = () => setScale((current) => clamp(Number((current + 0.1).toFixed(2)), 0.5, 2));
  const zoomOut = () => setScale((current) => clamp(Number((current - 0.1).toFixed(2)), 0.5, 2));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-white">
      {user && <NavBar role={user.role} userName={user.name} onLogout={logout} />}

      <div
        className="relative h-[calc(100vh-72px)] w-full overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
      >
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ← Back
          </button>
          <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 ring-1 ring-white/10">
            {game ? `${game.name} network` : 'Network editor'}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Reset
          </button>
          <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white ring-1 ring-white/20">{Math.round(scale * 100)}%</span>
        </div>

        <div className="absolute inset-0" aria-label="Network canvas">
          <div
            className={`pointer-events-none absolute inset-0 transition ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
              backgroundSize: '80px 80px',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl bg-white/5 px-6 py-4 text-center text-sm font-medium text-slate-100 ring-1 ring-white/10">
              Drag to pan the canvas, scroll to zoom, and use the controls above. Network editing tools are coming soon.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkEditor;
