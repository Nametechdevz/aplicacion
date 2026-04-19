import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPWA() {
  const [prompt, setPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setInstalled(true); setShow(false); });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setShow(false);
    setPrompt(null);
  };

  if (!show || installed) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="glass-card border-accent/40 p-4 flex items-center gap-3 shadow-2xl shadow-black/60 animate-bounce-slow">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm">SV</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Instalar StreamVault</p>
          <p className="text-gray-400 text-xs">Úsala como app nativa</p>
        </div>
        <button
          onClick={handleInstall}
          className="bg-accent hover:bg-accent-dark text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <Download size={14} />
          Instalar
        </button>
        <button onClick={() => setShow(false)} className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
