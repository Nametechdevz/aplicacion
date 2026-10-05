import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bell,
  Bot,
  Clock,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  History,
  KeyRound,
  ListPlus,
  MessageCircle,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Users,
  Workflow,
} from 'lucide-react';
import type { CustomField } from '@shared/types';
import { ROLE_LABELS, ROLE_PERMISSIONS, type Permission, type Role } from '@shared/permissions';
import { call, useQuery } from '../../lib/api';
import { attempt, toast, useStore } from '../../lib/store';
import { fmtBytes, fmtDateTime, relTime } from '../../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, Field, IconButton, InfoBox, Input, Modal, PageHeader, Select, SkeletonRows, Textarea, Toggle, confirmDialog, cx } from '../../components/ui';
import { WhatsAppSettings } from './WhatsAppSettings';

const SECTIONS: { id: string; label: string; icon: ReactNode; perm?: Permission }[] = [
  { id: 'account', label: 'Cuenta', icon: <User className="h-4 w-4" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'sending', label: 'Campañas y envíos', icon: <Send className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'automation', label: 'Automatizaciones', icon: <Workflow className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'hours', label: 'Horario de atención', icon: <Clock className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'ai', label: 'IA', icon: <Bot className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'fields', label: 'Campos personalizados', icon: <ListPlus className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'users', label: 'Usuarios y permisos', icon: <Users className="h-4 w-4" />, perm: 'users.manage' },
  { id: 'backup', label: 'Base de datos y backup', icon: <Database className="h-4 w-4" />, perm: 'backup.manage' },
  { id: 'appearance', label: 'Tema', icon: <Palette className="h-4 w-4" /> },
  { id: 'about', label: 'Actualizaciones y logs', icon: <RefreshCw className="h-4 w-4" />, perm: 'settings.manage' },
  { id: 'audit', label: 'Auditoría', icon: <History className="h-4 w-4" />, perm: 'audit.view' },
];

/** Carga, edita y guarda un bloque de configuración. */
function useSetting<T = any>(key: string) {
  const q = useQuery<T>('settings.get', { key });
  const [v, setV] = useState<T | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(q.data), [q.data]);
  const save = async (patch?: Partial<T>) => {
    setBusy(true);
    const r = await attempt(() => call<T>('settings.set', { key, value: { ...(v as any), ...(patch as any) } }), 'Configuración guardada');
    setBusy(false);
    if (r) setV(r);
    return r;
  };
  return { v, setV: (p: Partial<T>) => setV({ ...(v as any), ...p }), save, busy, loading: !v };
}

function SaveBar({ onSave, busy }: { onSave: () => void; busy: boolean }) {
  return (
    <div className="mt-6 flex justify-end">
      <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={busy} onClick={onSave}>
        Guardar cambios
      </Button>
    </div>
  );
}

const num = (s: string) => (s === '' ? 0 : Number(s));

export function Settings() {
  const { tab = 'account' } = useParams();
  const nav = useNavigate();
  const { can } = useStore();
  const sections = SECTIONS.filter((s) => !s.perm || can(s.perm));
  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title="Configuración" />
      <div className="grid grid-cols-[230px_1fr] gap-6">
        <nav className="space-y-0.5">
          {sections.map((s) => (
            <button key={s.id} onClick={() => nav(`/settings/${s.id}`)} className={cx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition', tab === s.id ? 'bg-brand/10 font-medium text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg')}>
              <span className={tab === s.id ? 'text-brand' : ''}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === 'account' && <AccountSection />}
          {tab === 'whatsapp' && <WhatsAppSettings />}
          {tab === 'sending' && <SendingSection />}
          {tab === 'automation' && <AutomationSection />}
          {tab === 'hours' && <HoursSection />}
          {tab === 'ai' && <AiSection />}
          {tab === 'notifications' && <NotificationsSection />}
          {tab === 'fields' && <FieldsSection />}
          {tab === 'users' && <UsersSection />}
          {tab === 'backup' && <BackupSection />}
          {tab === 'appearance' && <AppearanceSection />}
          {tab === 'about' && <AboutSection />}
          {tab === 'audit' && <AuditSection />}
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const { user, can } = useStore();
  const g = useSetting<any>('general');
  return (
    <div className="space-y-5">
      <Card title="Mi usuario">
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted">Nombre</dt>
            <dd className="font-medium">{user?.display_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Usuario</dt>
            <dd className="font-medium">{user?.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Rol</dt>
            <dd className="font-medium">{user && ROLE_LABELS[user.role]}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">Para cambiar la contraseña use el menú de usuario (abajo a la izquierda).</p>
      </Card>
      {can('settings.manage') && g.v && (
        <Card title="Preferencias generales">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Código de país por defecto" hint="Se agrega a los números sin código (ej. 57 Colombia, 52 México).">
              <Input value={g.v.defaultCountryCode} onChange={(e) => g.setV({ defaultCountryCode: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Zona horaria" hint="Usada en estadísticas, variables de fecha y tope diario.">
              <Input value={g.v.timezone} onChange={(e) => g.setV({ timezone: e.target.value })} />
            </Field>
            <Field label="Al cerrar la ventana">
              <Select value={g.v.closeBehavior} onChange={(e) => g.setV({ closeBehavior: e.target.value })}>
                <option value="ask">Preguntar</option>
                <option value="tray">Minimizar a la bandeja (seguir trabajando)</option>
                <option value="quit">Cerrar la aplicación</option>
              </Select>
            </Field>
            <div className="space-y-3 pt-6">
              <Toggle checked={g.v.launchAtLogin} onChange={(v) => g.setV({ launchAtLogin: v })} label="Iniciar con Windows" hint="Arranca minimizada en la bandeja para no perder tareas programadas." />
              <Toggle checked={g.v.startMinimized} onChange={(v) => g.setV({ startMinimized: v })} label="Iniciar minimizada" />
            </div>
          </div>
          <SaveBar onSave={() => g.save()} busy={g.busy} />
        </Card>
      )}
    </div>
  );
}

function SendingSection() {
  const s = useSetting<any>('sending');
  if (!s.v) return <SkeletonRows />;
  const f = (k: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" value={s.v[k]} onChange={(e) => s.setV({ [k]: num(e.target.value) })} />
    </Field>
  );
  return (
    <Card title="Control de envío" subtitle="Aplica a la cuenta de WhatsApp activa">
      <InfoBox tone="info" className="mb-5">
        Todos los envíos pasan por una cola persistente: uno a la vez, al ritmo configurado. Si WhatsApp responde RATE_LIMIT, la cuenta se pausa automáticamente y se reintenta después. Estos controles no buscan evadir límites: respete las políticas y límites de su cuenta en Meta.
      </InfoBox>
      <div className="grid grid-cols-2 gap-4">
        {f('ratePerMinute', 'Mensajes por minuto', 'Ritmo máximo de la cola.')}
        {f('dailyCap', 'Tope diario de envíos masivos', '0 = sin tope propio. Las respuestas manuales no se bloquean.')}
        {f('maxAttempts', 'Intentos máximos por mensaje', 'Para errores temporales.')}
        {f('retryBaseSeconds', 'Espera base entre reintentos (s)', 'Se duplica en cada intento.')}
        {f('rateLimitPauseSeconds', 'Pausa ante RATE_LIMIT (s)', 'Se duplica si se repite; respeta Retry-After.')}
        {f('missedScheduleGraceHours', 'Margen para campañas atrasadas (h)', 'Si la app estaba cerrada a la hora programada y pasó más que esto, la campaña queda en pausa para que usted decida.')}
        {f('confirmThreshold', 'Confirmación reforzada desde (destinatarios)', 'A partir de este número hay que escribir la cantidad para confirmar.')}
        {f('maxRecipientsPerRun', 'Máximo de destinatarios por envío', 'Protección contra envíos accidentales masivos.')}
      </div>
      <SaveBar onSave={() => s.save()} busy={s.busy} />
    </Card>
  );
}

function AutomationSection() {
  const hm = useSetting<any>('humanMode');
  const oo = useSetting<any>('optOut');
  const au = useSetting<any>('automation');
  if (!hm.v || !oo.v || !au.v) return <SkeletonRows />;
  return (
    <div className="space-y-5">
      <Card title="Modo humano" subtitle="Cuando un agente responde manualmente, las automatizaciones y la IA se pausan en esa conversación">
        <div className="grid grid-cols-2 gap-4">
          <Toggle checked={hm.v.enabled} onChange={(v) => hm.setV({ enabled: v })} label="Activar modo humano automático" />
          <Field label="Pausar durante (minutos)">
            <Input type="number" value={hm.v.pauseMinutes} onChange={(e) => hm.setV({ pauseMinutes: num(e.target.value) })} />
          </Field>
        </div>
        <SaveBar onSave={() => hm.save()} busy={hm.busy} />
      </Card>
      <Card title="Opt-out: NO CONTACTAR" subtitle="Si un contacto escribe exactamente una de estas palabras, se registra la baja">
        <div className="space-y-4">
          <Field label="Palabras clave (una por línea)" hint="La comparación ignora mayúsculas, acentos y signos. Debe ser el mensaje completo para evitar falsos positivos.">
            <Textarea rows={6} value={oo.v.keywords.join('\n')} onChange={(e) => oo.setV({ keywords: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <Toggle checked={oo.v.replyEnabled} onChange={(v) => oo.setV({ replyEnabled: v })} label="Enviar confirmación de baja" />
          {oo.v.replyEnabled && (
            <Field label="Mensaje de confirmación">
              <Textarea rows={3} value={oo.v.replyMessage} onChange={(e) => oo.setV({ replyMessage: e.target.value })} />
            </Field>
          )}
          <InfoBox tone="info">Al darse de baja: consentimiento = opt-out, etiqueta "No contactar", cancelación de envíos pendientes y exclusión de futuras campañas y automatizaciones.</InfoBox>
        </div>
        <SaveBar onSave={() => oo.save()} busy={oo.busy} />
      </Card>
      <Card title="Protecciones de automatizaciones">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Máx. ejecuciones por contacto y hora (por automatización)">
            <Input type="number" value={au.v.maxRunsPerContactPerHour} onChange={(e) => au.setV({ maxRunsPerContactPerHour: num(e.target.value) })} />
          </Field>
          <Field label="Profundidad máxima de encadenamiento" hint='Para "Ejecutar otra automatización" y triggers de etiquetas.'>
            <Input type="number" value={au.v.maxChainDepth} onChange={(e) => au.setV({ maxChainDepth: num(e.target.value) })} />
          </Field>
        </div>
        <SaveBar onSave={() => au.save()} busy={au.busy} />
      </Card>
    </div>
  );
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
function HoursSection() {
  const bh = useSetting<any>('businessHours');
  if (!bh.v) return <SkeletonRows />;
  const setDay = (d: string, p: any) => bh.setV({ days: { ...bh.v.days, [d]: { ...bh.v.days[d], ...p } } });
  return (
    <Card title="Horario de atención" subtitle="Usado por la condición de horario, la IA y la respuesta fuera de horario">
      <Field label="Zona horaria" className="mb-4 w-72">
        <Input value={bh.v.timezone} onChange={(e) => bh.setV({ timezone: e.target.value })} />
      </Field>
      <div className="space-y-2">
        {DAY_NAMES.map((name, i) => {
          const d = bh.v.days[String(i + 1)];
          return (
            <div key={name} className="grid grid-cols-[160px_120px_120px_1fr] items-center gap-3">
              <Toggle checked={d.enabled} onChange={(v) => setDay(String(i + 1), { enabled: v })} label={name} />
              <Input type="time" disabled={!d.enabled} value={d.open} onChange={(e) => setDay(String(i + 1), { open: e.target.value })} />
              <Input type="time" disabled={!d.enabled} value={d.close} onChange={(e) => setDay(String(i + 1), { close: e.target.value })} />
              <span className="text-xs text-muted">{d.enabled ? `${d.open} – ${d.close}` : 'Cerrado'}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-6 space-y-3 border-t border-line/60 pt-5">
        <Toggle checked={bh.v.outOfHoursReply.enabled} onChange={(v) => bh.setV({ outOfHoursReply: { ...bh.v.outOfHoursReply, enabled: v } })} label="Respuesta automática fuera de horario" hint="Se envía una sola vez por conversación en el periodo indicado." />
        {bh.v.outOfHoursReply.enabled && (
          <div className="grid grid-cols-[1fr_200px] gap-4">
            <Field label="Mensaje">
              <Textarea rows={3} value={bh.v.outOfHoursReply.message} onChange={(e) => bh.setV({ outOfHoursReply: { ...bh.v.outOfHoursReply, message: e.target.value } })} />
            </Field>
            <Field label="No repetir antes de (h)">
              <Input type="number" value={bh.v.outOfHoursReply.cooldownHours} onChange={(e) => bh.setV({ outOfHoursReply: { ...bh.v.outOfHoursReply, cooldownHours: num(e.target.value) } })} />
            </Field>
          </div>
        )}
      </div>
      <SaveBar onSave={() => bh.save()} busy={bh.busy} />
    </Card>
  );
}

function AiSection() {
  const ai = useSetting<any>('ai');
  const [key, setKey] = useState('');
  if (!ai.v) return <SkeletonRows />;
  return (
    <div className="space-y-5">
      <Card title="Proveedor de IA" subtitle="Claude (Anthropic) — opcional">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            Estado: {ai.v.configured ? <Badge tone="green" dot>API key configurada (cifrada)</Badge> : <Badge tone="amber">Sin configurar</Badge>}
          </div>
          <Field label="API key de Anthropic" hint="Se guarda cifrada con el almacenamiento seguro del sistema (DPAPI en Windows). Nunca se muestra de nuevo.">
            <div className="flex gap-2">
              <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" />
              <Button icon={<KeyRound className="h-4 w-4" />} disabled={!key} onClick={async () => (await attempt(() => call('ai.setApiKey', { apiKey: key }), 'API key guardada')) !== undefined && (setKey(''), ai.setV({ configured: true }))}>
                Guardar
              </Button>
              {ai.v.configured && (
                <Button variant="ghost" onClick={async () => (await confirmDialog({ title: 'Quitar API key', body: 'Los asistentes dejarán de responder.', danger: true })) && (await attempt(() => call('ai.setApiKey', { apiKey: null }), 'API key eliminada')) !== undefined && ai.setV({ configured: false })}>
                  Quitar
                </Button>
              )}
            </div>
          </Field>
          <Button variant="ghost" size="sm" onClick={() => call('app.openExternal', { url: 'https://console.anthropic.com/' })}>
            Obtener una API key →
          </Button>
        </div>
      </Card>
      <Card title="Modelo y contexto">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Modelo" hint="Por defecto claude-opus-5-5. Cada asistente puede usar otro.">
            <Input value={ai.v.model} onChange={(e) => ai.setV({ model: e.target.value })} />
          </Field>
          <Field label="Mensajes de contexto" hint="Cuántos mensajes recientes de la conversación se envían a la IA.">
            <Input type="number" value={ai.v.maxContextMessages} onChange={(e) => ai.setV({ maxContextMessages: num(e.target.value) })} />
          </Field>
        </div>
        <SaveBar onSave={() => ai.save({ model: ai.v.model, maxContextMessages: ai.v.maxContextMessages } as any)} busy={ai.busy} />
      </Card>
    </div>
  );
}

function NotificationsSection() {
  const n = useSetting<any>('notifications');
  if (!n.v) return <SkeletonRows />;
  const items: [string, string][] = [
    ['newMessage', 'Llega un mensaje (con la ventana sin foco)'],
    ['campaignFinished', 'Termina una campaña'],
    ['campaignFailed', 'Una campaña falla'],
    ['disconnected', 'WhatsApp se desconecta / se restaura'],
    ['automationFailed', 'Una automatización falla'],
    ['taskDue', 'Vence un seguimiento'],
    ['sound', 'Sonido en notificaciones de mensajes'],
  ];
  return (
    <Card title="Notificaciones de escritorio">
      <div className="space-y-3">
        {items.map(([k, l]) => (
          <Toggle key={k} checked={!!n.v[k]} onChange={(v) => n.setV({ [k]: v })} label={l} />
        ))}
      </div>
      <SaveBar onSave={() => n.save()} busy={n.busy} />
    </Card>
  );
}

function FieldsSection() {
  const q = useQuery<CustomField[]>('fields.list');
  const [edit, setEdit] = useState<any>(null);
  const save = async () => {
    const payload = { ...edit, options: edit.type === 'select' ? String(edit.optionsText ?? '').split(',').map((x: string) => x.trim()).filter(Boolean) : null };
    delete payload.optionsText;
    const ok = await attempt(() => (edit.id ? call('fields.update', { id: edit.id, label: edit.label, options: payload.options }) : call('fields.create', payload)), 'Campo guardado');
    if (ok) (setEdit(null), q.reload());
  };
  return (
    <Card title="Campos personalizados" subtitle="Datos extra por contacto. Se usan como variables: {{clave}}" actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ label: '', type: 'text' })}>Nuevo campo</Button>} padded={false}>
      {!q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <EmptyState icon={<ListPlus className="h-6 w-6" />} title="Sin campos" body="Ejemplos: Producto, Ciudad, Fecha compra, Monto, Vendedor, Código." />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {q.data.map((f) => (
              <tr key={f.id} className="table-row">
                <td className="py-2.5 pl-5 font-medium">{f.label}</td>
                <td>
                  <code className="rounded bg-elevated px-1.5 py-0.5 text-xs">{`{{${f.key}}}`}</code>
                </td>
                <td className="text-xs text-muted">{{ text: 'Texto', number: 'Número', date: 'Fecha', select: 'Lista' }[f.type]}{f.options ? `: ${f.options.join(', ')}` : ''}</td>
                <td className="pr-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...f, optionsText: f.options?.join(', ') })}>
                    Editar
                  </Button>
                  <IconButton title="Eliminar" onClick={async () => (await confirmDialog({ title: `Eliminar "${f.label}"`, body: 'Se borrarán los valores de todos los contactos.', danger: true, confirmText: 'Eliminar' })) && attempt(() => call('fields.delete', { id: f.id }).then(q.reload))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit?.id ? 'Editar campo' : 'Nuevo campo'} footer={<Button variant="primary" onClick={save} disabled={!edit?.label?.trim()}>Guardar</Button>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre">
              <Input autoFocus value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Ej. Producto" />
            </Field>
            {!edit.id && (
              <Field label="Tipo">
                <Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="date">Fecha</option>
                  <option value="select">Lista de opciones</option>
                </Select>
              </Field>
            )}
            {edit.type === 'select' && (
              <Field label="Opciones (separadas por coma)">
                <Input value={edit.optionsText ?? ''} onChange={(e) => setEdit({ ...edit, optionsText: e.target.value })} />
              </Field>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function UsersSection() {
  const { user } = useStore();
  const q = useQuery<any[]>('users.list');
  const meta = useQuery<{ permissions: Record<string, string>; roles: Record<string, string> }>('users.meta');
  const [edit, setEdit] = useState<any>(null);
  const save = async () => {
    const payload: any = { display_name: edit.display_name, role: edit.role, extra_permissions: edit.extra_permissions ?? [] };
    if (edit.password) payload.password = edit.password;
    const ok = await attempt(() => (edit.id ? call('users.update', { id: edit.id, ...payload, active: edit.active }) : call('users.create', { ...payload, username: edit.username, password: edit.password })), 'Usuario guardado');
    if (ok) (setEdit(null), q.reload());
  };
  const rolePerms = (r: Role) => ROLE_PERMISSIONS[r] as string[];
  return (
    <div className="space-y-5">
      <Card title="Usuarios" actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ username: '', display_name: '', password: '', role: 'agent', extra_permissions: [], active: true })}>Nuevo usuario</Button>} padded={false}>
        {!q.data ? (
          <SkeletonRows />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id} className="table-row cursor-pointer" onClick={() => setEdit({ ...u, password: '', active: !!u.active })}>
                  <td className="py-3 pl-5">
                    <p className="font-medium">
                      {u.display_name} {u.id === user?.id && <Badge tone="blue">Usted</Badge>}
                    </p>
                    <p className="text-xs text-muted">@{u.username}</p>
                  </td>
                  <td>
                    <Badge tone={u.role === 'admin' ? 'violet' : u.role === 'supervisor' ? 'blue' : 'slate'}>{ROLE_LABELS[u.role as Role]}</Badge>
                  </td>
                  <td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Desactivado</Badge>}</td>
                  <td className="pr-5 text-right text-xs text-muted">{u.last_login_at ? `Último acceso ${relTime(u.last_login_at)}` : 'Nunca ingresó'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Permisos por rol">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="pb-2">Permiso</th>
              {(['admin', 'supervisor', 'agent'] as Role[]).map((r) => (
                <th key={r} className="pb-2 text-center">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(meta.data?.permissions ?? {}).map(([p, l]) => (
              <tr key={p} className="border-t border-line/40">
                <td className="py-1.5">{l}</td>
                {(['admin', 'supervisor', 'agent'] as Role[]).map((r) => (
                  <td key={r} className="text-center">
                    {rolePerms(r).includes(p) ? <span className="text-emerald-400">✓</span> : <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar usuario' : 'Nuevo usuario'} footer={<Button variant="primary" onClick={save}>Guardar</Button>}>
        {edit && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre">
              <Input value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} />
            </Field>
            <Field label="Usuario">
              <Input value={edit.username} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, username: e.target.value })} />
            </Field>
            <Field label={edit.id ? 'Nueva contraseña (opcional)' : 'Contraseña'} hint="Mínimo 8 caracteres con letras y números.">
              <Input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            {edit.id && edit.id !== user?.id && <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Usuario activo" />}
            <div className="col-span-2">
              <p className="label">Permisos adicionales (además de los del rol)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(meta.data?.permissions ?? {})
                  .filter(([p]) => !rolePerms(edit.role).includes(p))
                  .map(([p, l]) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={edit.extra_permissions?.includes(p)} onChange={(v) => setEdit({ ...edit, extra_permissions: v ? [...(edit.extra_permissions ?? []), p] : edit.extra_permissions.filter((x: string) => x !== p) })} />
                      {l}
                    </label>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BackupSection() {
  const list = useQuery<any[]>('backup.list');
  const b = useSetting<any>('backup');
  const [busy, setBusy] = useState(false);
  const create = async (choosePath: boolean) => {
    setBusy(true);
    const r = await attempt(() => call<any>('backup.create', { choosePath }));
    setBusy(false);
    if (r) {
      toast.success('Backup creado', `${r.file} (${fmtBytes(r.size)})`);
      void list.reload();
    }
  };
  const restore = async (path?: string) => {
    if (!(await confirmDialog({ title: 'Restaurar backup', body: 'La aplicación se reiniciará y reemplazará los datos actuales por los del backup (se guarda una copia de seguridad de los datos actuales). Las credenciales cifradas solo funcionan en el mismo equipo y usuario de Windows.', danger: true, confirmText: 'Restaurar y reiniciar' }))) return;
    await attempt(() => call('backup.restore', { path: path ?? null }));
  };
  return (
    <div className="space-y-5">
      <Card title="Copias de seguridad" subtitle="Incluye contactos, etiquetas, campañas, automatizaciones, plantillas, configuración, historial y archivos multimedia">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<HardDrive className="h-4 w-4" />} loading={busy} onClick={() => create(false)}>
            Crear backup ahora
          </Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => create(true)}>
            Guardar backup en…
          </Button>
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => restore()}>
            Restaurar desde archivo…
          </Button>
          <Button variant="ghost" icon={<FolderOpen className="h-4 w-4" />} onClick={() => call('backup.openFolder')}>
            Abrir carpeta
          </Button>
        </div>
        {b.v && (
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line/60 pt-5">
            <Toggle checked={b.v.autoEnabled} onChange={(v) => b.setV({ autoEnabled: v })} label="Backup automático" hint={b.v.lastAutoBackupAt ? `Último: ${fmtDateTime(b.v.lastAutoBackupAt)}` : undefined} />
            <Field label="Cada (horas)">
              <Input type="number" value={b.v.intervalHours} onChange={(e) => b.setV({ intervalHours: num(e.target.value) })} />
            </Field>
            <Field label="Conservar (automáticos)">
              <Input type="number" value={b.v.keep} onChange={(e) => b.setV({ keep: num(e.target.value) })} />
            </Field>
            <div className="col-span-3 flex justify-end">
              <Button size="sm" onClick={() => b.save({ autoEnabled: b.v.autoEnabled, intervalHours: b.v.intervalHours, keep: b.v.keep } as any)}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Card title="Backups disponibles" padded={false}>
        {!list.data ? (
          <SkeletonRows rows={3} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={<Database className="h-6 w-6" />} title="Aún no hay backups" />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {list.data.map((x) => (
                <tr key={x.name} className="table-row">
                  <td className="py-2.5 pl-5 font-mono text-xs">{x.name}</td>
                  <td>{x.auto ? <Badge>Automático</Badge> : <Badge tone="blue">Manual</Badge>}</td>
                  <td className="text-xs text-muted">{fmtBytes(x.size)}</td>
                  <td className="text-xs text-muted">{fmtDateTime(x.created_at)}</td>
                  <td className="pr-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => restore(x.path)}>
                      Restaurar
                    </Button>
                    <IconButton title="Eliminar" onClick={() => attempt(() => call('backup.delete', { name: x.name }).then(list.reload))}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Base de datos">
        <p className="text-sm text-muted">SQLite local (modo WAL) en la carpeta de datos de la aplicación. Las actualizaciones de versión migran el esquema automáticamente y crean una copia previa en la carpeta de backups.</p>
      </Card>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useStore();
  const pick = async (t: 'dark' | 'light') => {
    setTheme(t);
    await attempt(() => call('settings.set', { key: 'appearance', value: { theme: t } }));
  };
  return (
    <Card title="Tema">
      <div className="grid max-w-xl grid-cols-2 gap-4">
        {(['dark', 'light'] as const).map((t) => (
          <button key={t} onClick={() => pick(t)} className={cx('overflow-hidden rounded-2xl border-2 text-left transition', theme === t ? 'border-brand' : 'border-line')}>
            <div className={cx('flex h-28 gap-2 p-3', t === 'dark' ? 'bg-[#0b1120]' : 'bg-[#f6f7fb]')}>
              <div className={cx('w-12 rounded-lg', t === 'dark' ? 'bg-[#111827]' : 'bg-white')} />
              <div className="flex-1 space-y-2">
                <div className={cx('h-4 w-2/3 rounded', t === 'dark' ? 'bg-[#1a2234]' : 'bg-white')} />
                <div className="h-4 w-1/3 rounded bg-emerald-500/70" />
              </div>
            </div>
            <p className="px-3 py-2 text-sm font-medium">{t === 'dark' ? 'Oscuro (por defecto)' : 'Claro'}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

function AboutSection() {
  const info = useQuery<any>('app.info');
  const [upd, setUpd] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <Card title="Acerca de">
        {info.data && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Versión</dt>
              <dd className="font-medium">{info.data.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Plataforma</dt>
              <dd>{info.data.platform} · Electron {info.data.electron}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Carpeta de datos</dt>
              <dd className="font-mono text-xs">{info.data.userData}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cifrado de credenciales</dt>
              <dd className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> {info.data.secrets === 'safeStorage' ? 'Almacenamiento seguro del sistema (DPAPI)' : 'AES-256-GCM con clave local'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Planificador</dt>
              <dd>{info.data.scheduler ? `Activo · último ciclo ${relTime(info.data.scheduler)}` : '—'}</dd>
            </div>
          </dl>
        )}
      </Card>
      <Card title="Actualizaciones">
        <p className="mb-3 text-sm text-muted">La aplicación busca actualizaciones automáticamente y las instala al cerrar. La base de datos, configuraciones, sesiones, campañas y contactos se conservan (están fuera de la carpeta de instalación).</p>
        <Button icon={<RefreshCw className="h-4 w-4" />} onClick={async () => setUpd((await attempt(() => call<any>('app.checkUpdates')))?.message ?? null)}>
          Buscar actualizaciones
        </Button>
        {upd && <InfoBox className="mt-3">{upd}</InfoBox>}
      </Card>
      <Card title="Logs">
        <p className="mb-3 text-sm text-muted">Registros con rotación en: application, whatsapp, campaigns, automation y errors. No se guardan tokens ni contenidos de mensajes; los teléfonos se enmascaran.</p>
        <Button icon={<FolderOpen className="h-4 w-4" />} onClick={() => call('app.openLogs')}>
          Abrir carpeta de logs
        </Button>
      </Card>
    </div>
  );
}

function AuditSection() {
  const q = useQuery<any[]>('audit.list', { limit: 300 });
  return (
    <Card title="Auditoría" subtitle="Acciones de los usuarios (inicio de sesión, cambios, campañas, backups…)" padded={false}>
      {!q.data ? (
        <SkeletonRows />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {q.data.map((a) => (
              <tr key={a.id} className="table-row">
                <td className="py-2 pl-5 text-xs text-muted">{fmtDateTime(a.created_at)}</td>
                <td className="font-mono text-xs">{a.action}</td>
                <td className="text-xs">{a.user_name ?? '—'}</td>
                <td className="max-w-md truncate pr-5 text-xs text-muted">
                  {a.entity_type ? `${a.entity_type} #${a.entity_id} ` : ''}
                  {a.details ? JSON.stringify(a.details) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
