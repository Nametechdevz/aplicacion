import { useEffect, useRef, useState } from 'react';
import type { LatLng, Place } from '../../../shared/types';
import { api } from '../api';
import { shortAddress } from '../geo';

interface Props {
  label: string;
  dot: 'pickup' | 'dropoff';
  value: Place | null;
  placeholder: string;
  near?: LatLng | null;
  active?: boolean;
  onFocus?: () => void;
  onSelect: (p: Place) => void;
}

export default function PlaceSearch({ label, dot, value, placeholder, near, active, onFocus, onSelect }: Props) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!editing) setText(value ? shortAddress(value.address) : '');
  }, [value, editing]);

  useEffect(() => {
    if (!editing || text.trim().length < 3) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const qs = new URLSearchParams({ q: text.trim() });
        if (near) {
          qs.set('lat', String(near.lat));
          qs.set('lng', String(near.lng));
        }
        const r = await api<Place[]>(`/geo/search?${qs}`);
        if (id === seq.current) setResults(r);
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [text, editing, near]);

  return (
    <div className={`place-search ${active ? 'active' : ''}`}>
      <label>
        <span className={`dot ${dot}`} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input
          value={text}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          onFocus={(e) => {
            setEditing(true);
            onFocus?.();
            e.currentTarget.select();
          }}
          onBlur={() => setTimeout(() => setEditing(false), 200)}
          onChange={(e) => setText(e.target.value)}
        />
        {busy && <span className="spinner small" />}
      </label>
      {editing && (results.length > 0 || error) && (
        <ul className="suggestions" role="listbox">
          {error && <li className="muted">{error}</li>}
          {results.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(p);
                  setEditing(false);
                  setResults([]);
                }}
              >
                <strong>{shortAddress(p.address)}</strong>
                <small>{p.address.split(',').slice(2).join(',')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
