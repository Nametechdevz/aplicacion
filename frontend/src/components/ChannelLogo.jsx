import React, { useState } from 'react';
import { Tv } from 'lucide-react';

const toBase64 = (str) => btoa(unescape(encodeURIComponent(str)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

export default function ChannelLogo({ src, name, size = 'md' }) {
  const [failed, setFailed] = useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  };

  const iconSize = { sm: 12, md: 14, lg: 18 }[size];
  const cls = sizeClasses[size] || sizeClasses.md;

  if (!src || failed) {
    return (
      <div className={`${cls} bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Tv size={iconSize} className="text-gray-600" />
      </div>
    );
  }

  const proxied = `/api/iptv/logo?u=${toBase64(src)}`;

  return (
    <div className={`${cls} bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      <img
        src={proxied}
        alt={name || ''}
        className="w-full h-full object-contain p-0.5"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
