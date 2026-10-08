'use client';

import { Bot, Download, Globe, KeyRound, LayoutTemplate, Monitor, Moon, Palette, ShieldCheck, SlidersHorizontal, Sun, Upload, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { applyTheme } from '@/components/shell/app-shell';
import { Badge, Button, Card, cn, Field, Input, Segmented, Select, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, formatDate } from '@/lib/client';
import { COUNTRY_PRESETS } from '@/lib/engine/spec';
import { AI_MODELS, type Settings } from '@/lib/settings';

function Section({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6 p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-text-2">{icon}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
          <p className="mt-0.5 text-sm text-text-2">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'auth.register': 'Cuenta creada',
  'auth.login': 'Inicio de sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.locked': 'Cuenta bloqueada temporalmente',
  'auth.logout': 'Cierre de sesión',
  'auth.password_changed': 'Contraseña cambiada',
  'auth.sessions_revoked': 'Otras sesiones cerradas',
  'prompt.deleted': 'Prompt eliminado',
  'library.imported': 'Biblioteca importada',
  'settings.updated': 'Configuración actualizada',
  'ai.improve': 'Mejora con IA',
};

export function SettingsView({
  initial,
  aiAvailable,
  user,
  templatesCount,
  audit,
}: {
  initial: Settings;
  aiAvailable: boolean;
  user: { name: string; email: string; role: string };
  templatesCount: number;
  audit: { id: number; action: string; ip: string | null; detail: string; created_at: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((cur) => ({ ...cur, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ settings: Settings }>('/api/settings', { method: 'PUT', body: s });
      setSaved(r.settings);
      setS(r.settings);
      applyTheme(r.settings.theme);
      toast.success('Configuración guardada');
      router.refresh();
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    setBusy('name');
    try {
      await api('/api/account/profile', { method: 'PUT', body: { name } });
      toast.success('Nombre actualizado');
      router.refresh();
    } catch (e) {
      toast.error('No se pudo actualizar', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    setBusy('pw');
    setPwErrors({});
    try {
      const r = await api<{ closedSessions: number }>('/api/account/password', { method: 'PUT', body: pw });
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Contraseña actualizada', r.closedSessions ? `Se cerraron ${r.closedSessions} sesiones en otros dispositivos.` : undefined);
    } catch (e) {
      if (e instanceof ApiError) setPwErrors(e.details ?? { _: e.message });
      toast.error('No se pudo cambiar la contraseña', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const closeSessions = async () => {
    setBusy('sessions');
    try {
      const r = await api<{ closed: number }>('/api/account/sessions', { method: 'DELETE' });
      toast.success(r.closed ? `${r.closed} sesiones cerradas` : 'No había otras sesiones abiertas');
    } catch (e) {
      toast.error('No se pudieron cerrar las sesiones', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const nav = [
    ['apariencia', 'Tema'],
    ['idioma', 'Idioma'],
    ['preferencias', 'Preferencias'],
    ['modelo', 'Modelo'],
    ['plantillas', 'Plantillas'],
    ['exportaciones', 'Exportaciones'],
    ['cuenta', 'Cuenta'],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-6 lg:mx-0 lg:h-fit lg:flex-col lg:px-0" aria-label="Secciones de configuración">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text">
            {label}
          </a>
        ))}
      </nav>

      <div className="min-w-0 space-y-5 pb-24">
        <Section id="apariencia" icon={<Palette className="size-4" />} title="Tema" description="Apariencia de PromptForge en este y otros dispositivos.">
          <Segmented
            value={s.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'light', label: <><Sun className="size-3.5" /> Claro</> },
              { value: 'dark', label: <><Moon className="size-3.5" /> Oscuro</> },
              { value: 'system', label: <><Monitor className="size-3.5" /> Sistema</> },
            ]}
          />
        </Section>

        <Section id="idioma" icon={<Globe className="size-4" />} title="Idioma y región" description="Valores por defecto de los nuevos proyectos. La interfaz de PromptForge está en español.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Idioma del proyecto" htmlFor="s-lang" hint="Idioma de la interfaz que construirá Claude.">
              <Input id="s-lang" value={s.projectLanguage} onChange={(e) => set('projectLanguage', e.target.value)} maxLength={60} />
            </Field>
            <Field label="País por defecto" htmlFor="s-country">
              <Select
                id="s-country"
                value={s.defaultCountry}
                onChange={(e) => {
                  const preset = COUNTRY_PRESETS.find((c) => c.country === e.target.value);
                  setS((cur) => ({ ...cur, defaultCountry: e.target.value, defaultCurrency: preset?.currency ?? cur.defaultCurrency }));
                }}
              >
                <option value="">Sin definir</option>
                {COUNTRY_PRESETS.map((c) => (
                  <option key={c.country}>{c.country}</option>
                ))}
              </Select>
            </Field>
            <Field label="Moneda por defecto" htmlFor="s-cur">
              <Input id="s-cur" value={s.defaultCurrency} onChange={(e) => set('defaultCurrency', e.target.value.toUpperCase())} maxLength={10} placeholder="USD" />
            </Field>
          </div>
        </Section>

        <Section id="preferencias" icon={<SlidersHorizontal className="size-4" />} title="Preferencias de generación" description="Cómo se crean los prompts nuevos.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Versión por defecto" htmlFor="s-variant">
              <Select id="s-variant" value={s.defaultVariant} onChange={(e) => set('defaultVariant', e.target.value as Settings['defaultVariant'])}>
                <option value="quick">QUICK — prompt corto</option>
                <option value="pro">PRO — prompt detallado</option>
                <option value="master">MASTER — máximo detalle</option>
              </Select>
            </Field>
            <Field label="Alcance por defecto" htmlFor="s-scope">
              <Select id="s-scope" value={s.defaultScope} onChange={(e) => set('defaultScope', e.target.value as Settings['defaultScope'])}>
                <option value="mvp">MVP funcional</option>
                <option value="complete">Producto completo</option>
                <option value="enterprise">Empresarial</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Switch checked={s.confirmBeforeRegenerate} onChange={(v) => set('confirmBeforeRegenerate', v)} label="Confirmar antes de regenerar" description="Pide confirmación si el texto editado se va a sustituir." />
          </div>
        </Section>

        <Section id="modelo" icon={<Bot className="size-4" />} title="Modelo utilizado" description='Modelo de Claude para "Mejorar con IA". La generación base es local y no usa la API.'>
          <div className="mb-4">
            {aiAvailable ? (
              <Badge tone="success">
                <ShieldCheck className="size-3" /> API configurada en el servidor
              </Badge>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning">
                La mejora con IA está desactivada: define <code className="font-mono">ANTHROPIC_API_KEY</code> en el entorno del servidor y reinícialo.
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modelo" htmlFor="s-model">
              <Select id="s-model" value={s.aiModel} onChange={(e) => set('aiModel', e.target.value as Settings['aiModel'])}>
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Esfuerzo de razonamiento" htmlFor="s-effort" hint="Más esfuerzo = mejor resultado, más lento y más tokens.">
              <Select id="s-effort" value={s.aiEffort} onChange={(e) => set('aiEffort', e.target.value as Settings['aiEffort'])}>
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </Select>
            </Field>
          </div>
        </Section>

        <Section id="plantillas" icon={<LayoutTemplate className="size-4" />} title="Plantillas" description="Plantillas predeterminadas y propias.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-2">
              Tienes <strong className="text-text">{templatesCount}</strong> plantilla{templatesCount === 1 ? '' : 's'} propia{templatesCount === 1 ? '' : 's'} y 17 predeterminadas.
            </p>
            <Link href="/templates" className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium hover:bg-surface-2">
              Gestionar plantillas
            </Link>
          </div>
        </Section>

        <Section id="exportaciones" icon={<Download className="size-4" />} title="Exportaciones" description="Formato de descarga y copias de seguridad.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Formato de exportación rápida" htmlFor="s-fmt">
              <Select id="s-fmt" value={s.exportFormat} onChange={(e) => set('exportFormat', e.target.value as Settings['exportFormat'])}>
                <option value="md">Markdown (.md)</option>
                <option value="txt">Texto plano (.txt)</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Switch checked={s.exportIncludeMeta} onChange={(v) => set('exportIncludeMeta', v)} label="Incluir metadatos" description="Añade nombre, versión, puntuación y fecha al principio del archivo." />
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <a href="/api/library/export" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium hover:bg-surface-2">
              <Download className="size-4" /> Exportar biblioteca (JSON)
            </a>
            <Link href="/prompts" className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm text-text-2 hover:bg-surface-2">
              <Upload className="size-4" /> Importar desde la biblioteca
            </Link>
          </div>
        </Section>

        <Section id="cuenta" icon={<User className="size-4" />} title="Cuenta" description={`${user.email} · ${user.role === 'admin' ? 'Administrador' : 'Usuario'}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Nombre" htmlFor="a-name">
                <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </Field>
              <Button onClick={saveName} loading={busy === 'name'} disabled={name.trim().length < 2 || name === user.name}>
                Guardar nombre
              </Button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void changePassword();
              }}
            >
              <input type="email" autoComplete="username" value={user.email} readOnly hidden />
              <Field label="Contraseña actual" htmlFor="a-cur" error={pwErrors.currentPassword}>
                <Input id="a-cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
              </Field>
              <Field label="Nueva contraseña" htmlFor="a-new" error={pwErrors.newPassword} hint="Mínimo 10 caracteres, con letras y números.">
                <Input id="a-new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
              </Field>
              <Button type="submit" icon={<KeyRound className="size-4" />} loading={busy === 'pw'} disabled={!pw.currentPassword || !pw.newPassword}>
                Cambiar contraseña
              </Button>
            </form>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-text-2">Cierra la sesión en todos los demás dispositivos.</p>
            <Button variant="outline" onClick={closeSessions} loading={busy === 'sessions'}>
              Cerrar otras sesiones
            </Button>
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium text-text">Actividad reciente de seguridad</h3>
            {audit.length === 0 ? (
              <p className="text-sm text-muted">Sin actividad registrada.</p>
            ) : (
              <ul className="divide-y divide-border text-[13px]">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className={cn('text-text-2', a.action.includes('failed') || a.action.includes('locked') ? 'text-danger' : '')}>{ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {formatDate(a.created_at, true)} {a.ip ? `· ${a.ip}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>

      {dirty && (
        <div className="glass animate-fade-up fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl border border-border-strong px-4 py-3 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:min-w-[380px]">
          <span className="text-sm text-text">Tienes cambios sin guardar</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setS(saved)}>
              Descartar
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
