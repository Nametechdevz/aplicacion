import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { RotateCcw, Maximize2, Volume2, VolumeX, AlertTriangle, Loader } from 'lucide-react';

const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 60,
  maxBufferLength: 30,
  maxMaxBufferLength: 90,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 8,
  manifestLoadingTimeOut: 10000,
  manifestLoadingMaxRetry: 2,
  levelLoadingTimeOut: 10000,
  levelLoadingMaxRetry: 2,
  fragLoadingTimeOut: 20000,
  fragLoadingMaxRetry: 3,
  startLevel: -1,
  debug: false,
};

// Engines in order: TS first (most IPTV providers stream raw MPEG-TS),
// then HLS proxy, HLS direct, native.
const ENGINES = ['mpegts_proxy', 'hls_proxy', 'hls_direct', 'native'];

export default function IPTVPlayer({ channel, streamInfo }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const mpegtsRef = useRef(null);
  const retryTimerRef = useRef(null);

  const [engine, setEngine] = useState(0);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const destroyPlayers = useCallback(() => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try { mpegtsRef.current.destroy(); } catch {}
      mpegtsRef.current = null;
    }
  }, []);

  const tryNextEngine = useCallback(() => {
    setEngine(prev => {
      const next = prev + 1;
      if (next >= ENGINES.length) {
        setStatus('error');
        setErrorMsg('No se pudo reproducir el canal. Intenta recargar o selecciona otro.');
        return prev;
      }
      return next;
    });
  }, []);

  const initPlayer = useCallback(() => {
    if (!streamInfo || !videoRef.current) return;
    destroyPlayers();
    clearTimeout(retryTimerRef.current);

    const video = videoRef.current;
    const engineName = ENGINES[engine];
    setStatus('loading');
    setErrorMsg('');
    video.removeAttribute('src');
    video.load();

    if (engineName === 'mpegts_proxy' && mpegts.getFeatureList().mseLivePlayback) {
      const player = mpegts.createPlayer(
        {
          type: 'mpegts',
          isLive: true,
          url: streamInfo.proxy_ts,
          hasAudio: true,
          hasVideo: true,
        },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 5,
          liveBufferLatencyMinRemain: 1,
          autoCleanupSourceBuffer: true,
        }
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});

      player.on(mpegts.Events.ERROR, () => {
        retryTimerRef.current = setTimeout(() => tryNextEngine(), 500);
      });

    } else if (engineName === 'hls_proxy' && Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamInfo.proxy_m3u8);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) tryNextEngine();
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
      video.src = streamInfo.m3u8;
      video.load();
      video.play().catch(() => {});
      video.onerror = () => tryNextEngine();

    } else {
      tryNextEngine();
    }

    const onPlaying = () => setStatus('playing');
    const onWaiting = () => setStatus('loading');
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
    };
  }, [streamInfo, engine, destroyPlayers, tryNextEngine]);

  useEffect(() => {
    if (!streamInfo) return;
    const cleanup = initPlayer();
    return () => {
      destroyPlayers();
      clearTimeout(retryTimerRef.current);
      if (cleanup) cleanup();
    };
  }, [streamInfo, engine]);

  useEffect(() => {
    setEngine(0);
    setStatus('idle');
    setErrorMsg('');
  }, [channel?.stream_id]);

  const handleRetry = () => {
    setEngine(0);
    setStatus('idle');
    setErrorMsg('');
  };

  const handleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
  };

  const engineLabel = ['TS Proxy', 'HLS Proxy', 'HLS Directo', 'Nativo'][engine] || '';

  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">📺</div>
          <p className="text-gray-400 font-semibold">Selecciona un canal</p>
        </div>
      )}

      {channel && status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70 pointer-events-none">
          <Loader size={40} className="text-accent animate-spin mb-3" />
          <p className="text-white text-sm font-semibold">{channel.name}</p>
          <p className="text-gray-400 text-xs mt-1">Motor: {engineLabel}</p>
        </div>
      )}

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

      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        playsInline
        autoPlay
        muted={muted}
        style={{ display: channel ? 'block' : 'none' }}
      />

      {channel && status !== 'error' && (
        <div className="absolute top-2 right-2 flex gap-2 z-20">
          <button
            onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }}
            className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button onClick={handleRetry} className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors">
            <RotateCcw size={16} />
          </button>
          <button onClick={handleFullscreen} className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-colors">
            <Maximize2 size={16} />
          </button>
        </div>
      )}

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
