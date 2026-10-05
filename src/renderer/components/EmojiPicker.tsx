import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { IconButton, cx } from './ui';

const GROUPS: { name: string; emojis: string }[] = [
  { name: 'Frecuentes', emojis: '👋😀😊😉😍🥰🤩😎🙌👏👍👌🙏💪🔥✨⭐🎉🎁💯✅❌⚠️📌📍💬📞📩🛒💳💰🕒📅🚀❤️💚💙💜🧡💛' },
  { name: 'Caras', emojis: '😀😃😄😁😆😅😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕' },
  { name: 'Gestos', emojis: '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪' },
  { name: 'Negocios', emojis: '💼📈📉📊💰💵💳🧾🏷️🛍️🛒📦🚚✈️🏠🏢🏪📱💻🖥️⌨️🖨️📷📞☎️📧📨📩📝📄📃📑📅📆🗓️⏰⏳⌛🔒🔑🎓📚✏️🖊️📌📍🔔📢📣' },
  { name: 'Símbolos', emojis: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝✅☑️✔️❌❎➕➖➗✖️💯🔥⭐🌟✨⚡💥🎉🎊🎁🏆🥇🥈🥉⚠️🚫⛔🔴🟠🟡🟢🔵🟣🟤⚫⚪' },
];

export function EmojiPicker({ onPick, className }: { onPick: (e: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  const list = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(GROUPS[g].emojis)].map((s) => s.segment);
  return (
    <div ref={ref} className={cx('relative', className)}>
      <IconButton type="button" title="Emojis" onClick={() => setOpen(!open)} active={open}>
        <Smile className="h-5 w-5" />
      </IconButton>
      {open && (
        <div className="absolute bottom-10 left-0 z-30 w-[320px] rounded-2xl border border-line bg-surface p-2 shadow-2xl animate-fade-in">
          <div className="mb-2 flex gap-1 overflow-x-auto">
            {GROUPS.map((gr, i) => (
              <button key={gr.name} type="button" onClick={() => setG(i)} className={cx('whitespace-nowrap rounded-lg px-2 py-1 text-[11px]', g === i ? 'bg-elevated text-fg' : 'text-muted hover:text-fg')}>
                {gr.name}
              </button>
            ))}
          </div>
          <div className="grid max-h-56 grid-cols-9 gap-0.5 overflow-y-auto">
            {list.map((e, i) => (
              <button key={i} type="button" onClick={() => onPick(e)} className="rounded-lg p-1 text-xl transition hover:scale-110 hover:bg-elevated">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
