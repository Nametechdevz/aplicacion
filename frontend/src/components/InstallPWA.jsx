import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Monitor, Apple } from 'lucide-react';

function detectDevice() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  return { isIOS, isAndroid, isSafari };
}

export default function InstallPWA() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { isIOS, isAndroid, isSafari } = detectDevice();

  useEffect(() => {
    // Already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // Check if user dismissed before
    if (sessionStorage.getItem('pwa-dismissed')) {
      setDismissed(true);
      return;
    }

    // Show banner after 3 seconds
    const timer = setTimeout(() => setShowBanner(true), 3000);

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (prompt) {
      // Chrome/Edge — native prompt
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setShowBanner(false);
    } else {
      // iOS or no prompt — show manual guide
      setShowGuide(true);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-dismissed', '1');
    setDismissed(true);
    setShowBanner(false);
  };

  if (installed || dismissed) return null;

  return (
    <>
      {/* Floating install banner */}
      {showBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-bounce-once">
          <div className="glass-card border border-accent/40 p-4 shadow-2xl shadow-black/60">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-sm">SV</span>
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Instalar StreamVault</p>
                <p className="text-gray-400 text-xs">Úsala como app en tu dispositivo</p>
              </div>
              <button onClick={handleDismiss} className="text-gray-500 hover:text-gray-300 p-1">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 bg-accent hover:bg-accent-dark text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Download size={16} />
                Instalar
              </button>
              <button
                onClick={() => setShowGuide(true)}
                className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-xs"
              >
                ¿Cómo?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual guide modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Cómo instalar StreamVault</h2>
              <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Android Chrome */}
              <div className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone size={18} className="text-green-400" />
                  <span className="text-white font-semibold text-sm">Android (Chrome)</span>
                </div>
                <ol className="text-gray-300 text-xs space-y-1.5 list-decimal list-inside">
                  <li>Toca el menú <span className="bg-gray-700 px-1.5 py-0.5 rounded text-white font-mono">⋮</span> (tres puntos arriba a la derecha)</li>
                  <li>Selecciona <strong className="text-white">"Instalar aplicación"</strong> o <strong className="text-white">"Añadir a pantalla de inicio"</strong></li>
                  <li>Confirma tocando <strong className="text-white">"Instalar"</strong></li>
                </ol>
              </div>

              {/* iPhone Safari */}
              <div className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Apple size={18} className="text-gray-300" />
                  <span className="text-white font-semibold text-sm">iPhone / iPad (Safari)</span>
                </div>
                <ol className="text-gray-300 text-xs space-y-1.5 list-decimal list-inside">
                  <li>Toca el botón <strong className="text-white">Compartir</strong> <span className="bg-gray-700 px-1.5 py-0.5 rounded text-white">⎙</span> (abajo en el centro)</li>
                  <li>Desliza y toca <strong className="text-white">"Añadir a pantalla de inicio"</strong></li>
                  <li>Toca <strong className="text-white">"Añadir"</strong> arriba a la derecha</li>
                </ol>
                <p className="text-yellow-400 text-xs mt-2">⚠️ Solo funciona en Safari, no en Chrome para iOS</p>
              </div>

              {/* PC Chrome/Edge */}
              <div className="bg-gray-800/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor size={18} className="text-blue-400" />
                  <span className="text-white font-semibold text-sm">PC (Chrome / Edge)</span>
                </div>
                <ol className="text-gray-300 text-xs space-y-1.5 list-decimal list-inside">
                  <li>Busca el ícono <strong className="text-white">⊕</strong> o <strong className="text-white">💻</strong> en la barra de direcciones (derecha)</li>
                  <li>Haz clic en él y selecciona <strong className="text-white">"Instalar"</strong></li>
                </ol>
                <p className="text-gray-500 text-xs mt-2">Si no aparece: Menú ⋮ → Más herramientas → Crear acceso directo → Abrir como ventana</p>
              </div>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="btn-primary w-full justify-center mt-5"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
