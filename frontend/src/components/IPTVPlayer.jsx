import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { RotateCcw, Maximize2, Volume2, VolumeX, AlertTriangle, Loader } from 'lucide-react';

const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 60,
  maxBufferLength: 30,
  maxMaxBufferLength: 90,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 8,
  manifestLoadingTimeOut: 15000,
  manifestLoadingMaxRetry: 4,
  levelLoadingTimeOut: 15000,
  levelLoadingMaxRetry: 4,
  fragLoadingTimeOut: 25000,
  fragLoadingMaxRetry: 6,
  startLevel: -1,
  debug: false,
};

// Player engines tried in order
const ENGINES = ['hls_proxy', 'hls_direct', 'native', 'native_ts'];

export default function IPTVPlayer({ channel, streamInfo, onError }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);

  const [engine, setEngine] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | error
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [retries, setRetries] = useState(0);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
  }, []);

  const tryNextEngine = useCallback(() => {
    setEngine(prev => {
      const next = prev + 1;
      if (next >= ENGINES.length) {
        setStatus('error');
        setErrorMsg('No se pudo reproducir el canal con ningún método. Intenta recargar.');
        return prev;
      }
      return next;
    });
  }, []);

  const initPlayer = useCallback(() => {
    if (!streamInfo || !videoRef.current) return;
    destroyHls();
    clearTimeout(retryTimerRef.current);

    const video = videoRef.current;
    const engineName = ENGINES[engine];
    setStatus('loading');
    setErrorMsg('');

    const onPlaying = () => setStatus('playing');
    const onWaiting = () => setStatus('loading');
    const onStalled = () => {
      // Auto-recover stall
      retryTimerRef.current = setTimeout(() => {
        if (hlsRef.current) hlsRef.current.startLoad();
        else { video.load(); video.play().catch(() => {}); }
      }, 4000);
    };

    video.removeAttribute('src');
    video.load();

    if (engineName === 'hls_proxy' && Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamInfo.proxy_m3u8);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setRetries(r => {
              if (r < 3) {
                retryTimerRef.current = setTimeout(() => hls.startLoad(), 3000);
                return r + 1;
              }
              tryNextEngine();
              return 0;
            });
          } else {
            tryNextEngine();
          }
        }
      });

    } else if (engineName === 'hls_direct' && Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamInfo.m3u8);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) tryNextEngine();
      });

    } else if (engineName === 'native') {
      // Native HLS (Safari) or direct m3u8
      video.src = streamInfo.m3u8;
      video.load();
      video.play().catch(() => {});
      video.onerror = () => tryNextEngine();

    } else if (engineName === 'native_ts') {
      // Last resort: TS stream directly
      video.src = streamInfo.proxy_ts;
      video.load();
      video.play().catch(() => {});
      video.onerror = () => {
        setStatus('error');
        setErrorMsg('Canal no disponible en este momento.');
      };
    }

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
    };
  }, [streamInfo, engine, destroyHls, tryNextEngine]);

  // Init on channel/engine change
  useEffect(() => {
    if (!streamInfo) return;
    setRetries(0);
    const cleanup = initPlayer();
    return () => {
      destroyHls();
      clearTimeout(retryTimerRef.current);
      if (cleanup) cleanup();
    };
  }, [streamInfo, engine]);

  // Reset engine when channel changes
  useEffect(() => {
    setEngine(0);
    setStatus('idle');
    setErrorMsg('');
    setRetries(0);
  }, [channel?.stream_id]);

  const handleRetry = () => {
    setEngine(0);
    setStatus('idle');
    setErrorMsg('');
    setRetries(0);
  };

  const handleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
  };

  const engineLabel = ['Proxy HLS', 'Directo HLS', 'Nativo', 'Stream TS'][engine] || '';

  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
      {/* No channel selected */}
      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">📺</div>
          <p className="text-gray-400 font-semibold">Selecciona un canal</p>
        </div>
      )}

      {/* Loading overlay */}
      {channel && status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70 pointer-events-none">
          <Loader size={40} className="text-accent animate-spin mb-3" />
          <p className="text-white text-sm font-semibold">{channel.name}</p>
          <p className="text-gray-400 text-xs mt-1">Motor: {engineLabel}</p>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90 p-6 text-center">
          <AlertTriangle size={40} className="text-red-400 mb-3" />
          <p className="text-white font-bold mb-1">{channel?.name}</p>
          <p className="text-gray-400 text-sm mb-4">{errorMsg}</p>
          <button onClick={handleRetry} className="btn-primary">
            <RotateCcw size={16} /> Reintentar
          </button>
        </div>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        playsInline
        autoPlay
        muted={muted}
        style={{ display: channel ? 'block' : 'none' }}
      />

      {/* Controls overlay */}
      {channel && status !== 'error' && (
        <div className="absolute top-2 right-2 flex gap-2 z-20">
          <button
            onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }}
            className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors"
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button onClick={handleRetry} className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors" title="Recargar canal">
            <RotateCcw size={16} />
          </button>
          <button onClick={handleFullscreen} className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors" title="Pantalla completa">
            <Maximize2 size={16} />
          </button>
        </div>
      )}

      {/* Engine indicator */}
      {channel && status === 'playing' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 z-20 pointer-events-none">
          <span className="flex items-center gap-1.5 bg-red-600/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />EN VIVO
          </span>
          <span className="bg-black/60 text-gray-300 text-xs px-2 py-0.5 rounded-full">{engineLabel}</span>
        </div>
      )}
    </div>
  );
}
