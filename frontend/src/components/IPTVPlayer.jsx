import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { RotateCcw, Maximize2, Volume2, VolumeX, AlertTriangle, Radio } from 'lucide-react';

const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 90,
  maxBufferLength: 60,
  maxMaxBufferLength: 600,
  maxBufferHole: 2,
  liveSyncDurationCount: 6,
  liveMaxLatencyDurationCount: 15,
  manifestLoadingTimeOut: 15000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 1500,
  levelLoadingTimeOut: 15000,
  levelLoadingMaxRetry: 4,
  levelLoadingRetryDelay: 1500,
  fragLoadingTimeOut: 30000,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 1500,
  startLevel: -1,
  debug: false,
};

const MPEGTS_MEDIA = (url) => ({ type: 'mpegts', isLive: true, url, hasAudio: true, hasVideo: true });
const MPEGTS_CFG = {
  enableStashBuffer: true,
  stashInitialSize: 512,
  liveBufferLatencyChasing: true,
  liveBufferLatencyMaxLatency: 10,
  liveBufferLatencyMinRemain: 4,
  autoCleanupSourceBuffer: true,
  autoCleanupMaxBackwardDuration: 40,
  autoCleanupMinBackwardDuration: 15,
  lazyLoad: false,
  reuseRedirectedURL: true,
  fixAudioTimestampGap: true,
};

const ENGINES = ['mpegts_proxy', 'hls_proxy', 'hls_direct', 'native'];
const ENGINE_LABELS = ['TS Proxy', 'HLS Proxy', 'HLS Directo', 'Nativo'];
const STALL_TIMEOUT = 9000;
const MAX_SOFT_RETRIES = 2;

export default function IPTVPlayer({ channel, streamInfo }) {
  const videoRef     = useRef(null);
  const hlsRef       = useRef(null);
  const mpegtsRef    = useRef(null);
  const retryTimer   = useRef(null);
  const stallTimer   = useRef(null);
  const lastProgress = useRef(Date.now());
  const softRetries  = useRef(0);

  const [engine, setEngine]     = useState(0);
  const [status, setStatus]     = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted]       = useState(false);

  const clearTimers = () => {
    clearTimeout(retryTimer.current);
    clearInterval(stallTimer.current);
  };

  const destroyPlayers = useCallback(() => {
    clearTimers();
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.pause();
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }
  }, []);

  const tryNextEngine = useCallback(() => {
    softRetries.current = 0;
    setEngine(prev => {
      const next = prev + 1;
      if (next >= ENGINES.length) {
        setStatus('error');
        setErrorMsg('No se pudo reproducir este canal. Puede estar offline o bloqueado.');
        return prev;
      }
      return next;
    });
  }, []);

  const softRecover = useCallback(() => {
    lastProgress.current = Date.now();
    const video = videoRef.current;
    if (!video) return;
    try {
      if (mpegtsRef.current) {
        mpegtsRef.current.unload();
        mpegtsRef.current.load();
        mpegtsRef.current.play().catch(() => {});
        return;
      }
      if (hlsRef.current) {
        hlsRef.current.startLoad();
        video.play().catch(() => {});
        return;
      }
      video.load();
      video.play().catch(() => {});
    } catch {}
  }, []);

  const handleError = useCallback(() => {
    softRetries.current += 1;
    if (softRetries.current <= MAX_SOFT_RETRIES) {
      retryTimer.current = setTimeout(softRecover, 1500);
    } else {
      tryNextEngine();
    }
  }, [softRecover, tryNextEngine]);

  const initPlayer = useCallback(() => {
    if (!streamInfo || !videoRef.current) return;
    destroyPlayers();

    const video = videoRef.current;
    const engineName = ENGINES[engine];
    setStatus('loading');
    setErrorMsg('');
    softRetries.current = 0;
    lastProgress.current = Date.now();

    video.removeAttribute('src');
    video.load();

    if (engineName === 'mpegts_proxy' && mpegts.getFeatureList().mseLivePlayback) {
      const player = mpegts.createPlayer(MPEGTS_MEDIA(streamInfo.proxy_ts), MPEGTS_CFG);
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});
      player.on(mpegts.Events.ERROR, (type, detail) => {
        console.warn('[mpegts] error:', type, detail?.msg || '');
        retryTimer.current = setTimeout(handleError, 1000);
      });

    } else if (engineName === 'hls_proxy' && Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamInfo.proxy_m3u8);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); } catch {}
        } else {
          handleError();
        }
      });

    } else if (engineName === 'hls_direct' && Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamInfo.m3u8);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) handleError(); });

    } else if (engineName === 'native') {
      video.src = streamInfo.m3u8;
      video.load();
      video.play().catch(() => {});
      video.onerror = handleError;

    } else {
      tryNextEngine();
      return;
    }

    stallTimer.current = setInterval(() => {
      if (!video || video.paused || video.ended) return;
      if (Date.now() - lastProgress.current > STALL_TIMEOUT) {
        console.warn('[player] stall detected, recovering');
        softRecover();
      }
    }, 2500);

    const onPlaying  = () => { setStatus('playing'); softRetries.current = 0; lastProgress.current = Date.now(); };
    const onWaiting  = () => setStatus('loading');
    const onProgress = () => { lastProgress.current = Date.now(); };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('timeupdate', onProgress);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('timeupdate', onProgress);
    };
  }, [streamInfo, engine, destroyPlayers, tryNextEngine, softRecover, handleError]);

  useEffect(() => {
    if (!streamInfo) return;
    const cleanup = initPlayer();
    return () => { destroyPlayers(); if (cleanup) cleanup(); };
  }, [streamInfo, engine]);

  useEffect(() => {
    setEngine(0);
    setStatus('idle');
    setErrorMsg('');
  }, [channel?.stream_id]);

  const handleRetry = () => { setEngine(0); setStatus('idle'); setErrorMsg(''); };

  const handleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (v) v.muted = !muted;
    setMuted(m => !m);
  };

  const engineLabel = ENGINE_LABELS[engine] || '';

  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>

      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950">
          <div className="w-20 h-20 rounded-2xl bg-gray-900 flex items-center justify-center mb-5 border border-gray-800">
            <Radio size={36} className="text-gray-600" />
          </div>
          <p className="text-gray-400 font-semibold text-lg">Selecciona un canal</p>
          <p className="text-gray-600 text-sm mt-1">para comenzar a ver TV en Vivo</p>
        </div>
      )}

      {channel && status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80 backdrop-blur-sm pointer-events-none">
          <div className="relative mb-4">
            <div className="w-14 h-14 border-4 border-accent/20 rounded-full" />
            <div className="w-14 h-14 border-4 border-accent border-t-transparent rounded-full animate-spin absolute inset-0" />
          </div>
          <p className="text-white text-sm font-semibold truncate max-w-xs text-center">{channel.name}</p>
          <p className="text-gray-500 text-xs mt-1">Motor: {engineLabel}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-950 p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 flex items-center justify-center mb-4 border border-red-800/40">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <p className="text-white font-bold mb-1">{channel?.name}</p>
          <p className="text-gray-400 text-sm mb-5 max-w-xs">{errorMsg}</p>
          <button onClick={handleRetry} className="btn-primary py-2.5 px-6">
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
        <div className="absolute top-3 right-3 flex gap-1.5 z-20">
          <button onClick={toggleMute} className="bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-2 rounded-lg transition-colors border border-white/10">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button onClick={handleRetry} className="bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-2 rounded-lg transition-colors border border-white/10" title="Recargar">
            <RotateCcw size={15} />
          </button>
          <button onClick={handleFullscreen} className="bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white p-2 rounded-lg transition-colors border border-white/10">
            <Maximize2 size={15} />
          </button>
        </div>
      )}

      {channel && status === 'playing' && (
        <div className="absolute bottom-14 left-3 flex items-center gap-2 z-20 pointer-events-none">
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            EN VIVO
          </span>
          <span className="bg-black/60 backdrop-blur-sm text-gray-300 text-xs px-2 py-1 rounded-full border border-white/10">
            {engineLabel}
          </span>
        </div>
      )}
    </div>
  );
}
