import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, FlaskConical, Info, LogOut, MessageCircle, Plug, PlugZap, Plus, QrCode, RefreshCw, Send, ShieldCheck, Trash2, Unplug, WifiOff, X } from 'lucide-react';
import type { WhatsAppAccount } from '@shared/types';
import { call, useAppEvent, useQuery } from '../../lib/api';
import { attempt, toast, useStore } from '../../lib/store';
import { fmtDateTime, relTime } from '../../lib/format';
import { Badge, Button, Card, Field, InfoBox, Input, Modal, Select, StatusDot, Textarea, confirmDialog, cx } from '../../components/ui';

const STATUS: Record<string, { label: string; tone: string; emoji: string }> = {
  connected: { label: 'Conectado', tone: 'green', emoji: '🟢' },
  connecting: { label: 'Conectando', tone: 'amber', emoji: '🟡' },
  disconnected: { label: 'Desconectado', tone: 'red', emoji: '🔴' },
  error: { label: 'Error de credenciales', tone: 'red', emoji: '🔴' },
  qr_required: { label: 'Escanear QR', tone: 'blue', emoji: '🔵' },
};

interface CloudForm {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
}
const emptyCloud = (): CloudForm => ({ accessToken: '', phoneNumberId: '', wabaId: '', appSecret: '', verifyToken: crypto.randomUUID().replace(/-/g, '').slice(0, 24), apiVersion: 'v23.0' });

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          size="md"
          icon={done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          Copiar
        </Button>
      </div>
    </Field>
  );
}

function CloudFields({ f, setF, editing }: { f: CloudForm; setF: (f: CloudForm) => void; editing?: { accessTokenHint?: string; hasAppSecret?: boolean } }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field className="col-span-2" label="Token de acceso (System User)" hint={editing?.accessTokenHint ? `Actual: ${editing.accessTokenHint}. Déjelo vacío para conservarlo.` : 'Meta Business → Usuarios del sistema → Generar token con permisos whatsapp_business_messaging y whatsapp_business_management.'}>
        <Input type="password" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="EAAG…" />
      </Field>
      <Field label="Phone Number ID">
        <Input value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value.trim() })} placeholder="1234567890" />
      </Field>
      <Field label="WhatsApp Business Account ID" hint="Necesario para sincronizar plantillas aprobadas.">
        <Input value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value.trim() })} placeholder="9876543210" />
      </Field>
      <Field label="App Secret" hint={editing?.hasAppSecret ? 'Configurado. Déjelo vacío para conservarlo.' : 'Se usa para verificar la firma de cada webhook.'}>
        <Input type="password" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value })} />
      </Field>
      <Field label="Versión de la Graph API">
        <Input value={f.apiVersion} onChange={(e) => setF({ ...f, apiVersion: e.target.value.trim() })} />
      </Field>
      <div className="col-span-2">
        <CopyField label="Token de verificación del webhook" value={f.verifyToken} hint="Péguelo en Meta → WhatsApp → Configuración → Webhook → Verify token." />
      </div>
    </div>
  );
}

/** Asistente para agregar una cuenta (Cloud API oficial o simulador). */
export function AddAccount({ onDone, onCancel }: { onDone: (a: WhatsAppAccount) => void; onCancel?: () => void }) {
  const [provider, setProvider] = useState<'cloud_api' | 'simulator' | null>(null);
  const [name, setName] = useState('Principal');
  const [f, setF] = useState<CloudForm>(emptyCloud);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const config = provider === 'cloud_api' ? { ...f, wabaId: f.wabaId || '' } : undefined;
      const a = await call<WhatsAppAccount>('accounts.create', { name, provider, config });
      await useStore.getState().refreshAccounts();
      await useStore.getState().switchAccount(a.id);
      toast.success('Cuenta agregada', 'Conectando…');
      const c = await attempt(() => call<WhatsAppAccount>('accounts.connect', { accountId: a.id }));
      if (c?.status === 'connected') toast.success('🟢 WhatsApp conectado');
      await useStore.getState().refreshAccounts();
      onDone(a);
    } catch (e: any) {
      toast.error('No se pudo agregar la cuenta', e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!provider)
    return (
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => setProvider('cloud_api')} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/60">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="font-semibold">WhatsApp Business Cloud API</p>
          <p className="mt-1 text-sm text-muted">Integración oficial de Meta. Envíos, recepción por webhook, estados de entrega/lectura, multimedia y plantillas aprobadas.</p>
          <Badge tone="green" className="mt-3">
            Recomendado · Oficial
          </Badge>
        </button>
        <button onClick={() => setProvider('simulator')} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:border-violet-500/60">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
            <FlaskConical className="h-6 w-6" />
          </div>
          <p className="font-semibold">Simulador (pruebas)</p>
          <p className="mt-1 text-sm text-muted">No envía mensajes reales. Sirve para probar campañas, automatizaciones e IA sin una cuenta de Meta. Permite simular mensajes entrantes y desconexiones.</p>
          <Badge tone="violet" className="mt-3">
            Solo pruebas
          </Badge>
        </button>
        <InfoBox tone="info" className="col-span-2" icon={<QrCode className="h-4 w-4" />}>
          <b>¿Y la conexión por QR?</b> Vincular un teléfono escaneando un QR solo es posible con clientes no oficiales de WhatsApp Web, que incumplen los Términos de WhatsApp y exponen el número a bloqueos. Por eso esta aplicación usa la API oficial. La arquitectura (<code>WhatsAppProvider</code>) admite un proveedor con QR si en el futuro existe uno autorizado.
        </InfoBox>
        {onCancel && (
          <div className="col-span-2 flex justify-end">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <Field label="Nombre de la cuenta" hint="Para identificarla si usa varias (ej. Ventas, Soporte).">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {provider === 'cloud_api' && (
        <>
          <CloudFields f={f} setF={setF} />
          <WebhookHelp />
        </>
      )}
      {provider === 'simulator' && <InfoBox tone="warn">El simulador no se comunica con WhatsApp. Úselo para validar flujos; para enviar mensajes reales agregue una cuenta de Cloud API.</InfoBox>}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setProvider(null)}>
          Atrás
        </Button>
        <Button variant="primary" loading={busy} icon={<PlugZap className="h-4 w-4" />} onClick={create} disabled={!name.trim() || (provider === 'cloud_api' && (!f.phoneNumberId || !f.accessToken || !f.appSecret))}>
          Conectar WhatsApp
        </Button>
      </div>
    </div>
  );
}

function WebhookHelp() {
  const st = useQuery<{ listening: boolean; address: { host: string; port: number } | null; lastEventAt: string | null; lastError: string | null; settings: { port: number; host: string } }>('accounts.webhookStatus', undefined, { refreshOn: ['message.received'] });
  const port = st.data?.settings.port ?? 3977;
  return (
    <InfoBox tone="info" icon={<Info className="h-4 w-4" />}>
      <p className="font-medium">Recepción de mensajes (webhook)</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed">
        <li>
          La aplicación escucha en <code>http://127.0.0.1:{port}/webhook</code>
          {st.data && (st.data.listening ? ' (activo ✓)' : ' (se inicia al guardar la cuenta)')}.
        </li>
        <li>
          Expóngalo por HTTPS con un túnel (ej. <code>cloudflared tunnel --url http://localhost:{port}</code>) o un proxy inverso de su servidor.
        </li>
        <li>
          En Meta → WhatsApp → Configuración → Webhook: <b>Callback URL</b> = <code>https://SU-DOMINIO/webhook</code>, <b>Verify token</b> = el de arriba. Suscríbase al campo <b>messages</b>.
        </li>
      </ol>
      {st.data?.lastEventAt && <p className="mt-1 text-xs">Último evento recibido: {relTime(st.data.lastEventAt)}</p>}
      {st.data?.lastError && <p className="mt-1 text-xs text-red-300">{st.data.lastError}</p>}
    </InfoBox>
  );
}

function Capabilities() {
  const q = useQuery<any>('accounts.current', undefined, { refreshOn: ['account.status'] });
  const c = q.data?.capabilities;
  if (!c) return null;
  const rows: [string, boolean, string?][] = [
    ['Enviar texto, imágenes, videos y documentos', c.sendMedia],
    ['Enviar audio', c.sendAudio],
    ['Plantillas aprobadas por WhatsApp', c.templates],
    ['Estados entregado / leído', c.readReceipts],
    ['Sincronizar agenda de contactos', c.contactSync, 'No disponible en la API oficial: los contactos se crean al recibir mensajes, por importación CSV o manualmente.'],
    ['Sincronizar etiquetas de WhatsApp Business', c.labelsSync, 'No disponible: use las etiquetas del CRM.'],
    ['Historial previo a la conexión', c.historySync, 'No disponible: el historial se construye desde la conexión.'],
  ];
  return (
    <Card title="Capacidades de esta integración" subtitle="Lo que la conexión actual permite realmente">
      <ul className="space-y-2 text-sm">
        {rows.map(([label, ok, why]) => (
          <li key={label} className="flex items-start gap-2">
            {ok ? <Check className="mt-0.5 h-4 w-4 text-emerald-400" /> : <X className="mt-0.5 h-4 w-4 text-red-400" />}
            <span>
              {label}
              {!ok && why && <span className="block text-xs text-muted">{why}</span>}
            </span>
          </li>
        ))}
        {c.customerServiceWindowHours && (
          <li className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-sky-400" />
            <span>
              Ventana de atención de {c.customerServiceWindowHours} h
              <span className="block text-xs text-muted">Para iniciar conversación o escribir pasadas 24 h del último mensaje del cliente, WhatsApp exige una plantilla aprobada.</span>
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

function SimulatorPanel() {
  const [phone, setPhone] = useState('+57 300 123 4567');
  const [name, setName] = useState('Cliente de prueba');
  const [text, setText] = useState('Hola, ¿cuál es el precio del plan premium?');
  const send = () => attempt(() => call('simulator.inbound', { phone, name, text }), 'Mensaje entrante simulado');
  return (
    <Card title="Simulador" subtitle="Herramientas para probar flujos sin WhatsApp real" actions={<Badge tone="violet">Pruebas</Badge>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono del cliente">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Nombre de perfil">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mensaje" className="col-span-2">
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={send}>
          Simular mensaje entrante
        </Button>
        <Button icon={<WifiOff className="h-4 w-4" />} onClick={() => attempt(() => call('simulator.connectionLoss'), 'Desconexión simulada')}>
          Simular desconexión
        </Button>
      </div>
    </Card>
  );
}

function EditCredentials({ account, open, onClose }: { account: WhatsAppAccount; open: boolean; onClose: () => void }) {
  const [f, setF] = useState<CloudForm>(emptyCloud);
  const [meta, setMeta] = useState<any>(null);
  const [name, setName] = useState(account.name);
  useEffect(() => {
    if (!open) return;
    setName(account.name);
    if (account.provider === 'cloud_api')
      void call<any>('accounts.publicConfig', { accountId: account.id }).then((c) => {
        setMeta(c);
        setF({ accessToken: '', appSecret: '', phoneNumberId: c.phoneNumberId ?? '', wabaId: c.wabaId ?? '', verifyToken: c.verifyToken || emptyCloud().verifyToken, apiVersion: c.apiVersion ?? 'v23.0' });
      });
  }, [open, account]);
  const save = async () => {
    const config = account.provider === 'cloud_api' ? Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) : undefined;
    const r = await attempt(() => call('accounts.update', { accountId: account.id, name, config }), 'Cuenta actualizada');
    if (r) {
      await useStore.getState().refreshAccounts();
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Editar ${account.name}`} footer={<Button variant="primary" onClick={save}>Guardar</Button>}>
      <div className="space-y-4">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {meta?.error && <InfoBox tone="warn">{meta.error}</InfoBox>}
        {account.provider === 'cloud_api' && <CloudFields f={f} setF={setF} editing={meta ?? undefined} />}
      </div>
    </Modal>
  );
}

function AccountCard({ a }: { a: WhatsAppAccount }) {
  const { can, refreshAccounts, accountId } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    await attempt(fn, ok);
    await refreshAccounts();
    setBusy(null);
  };
  const st = STATUS[a.status] ?? STATUS.disconnected;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <StatusDot status={a.status} /> {a.name} {a.id === accountId && <Badge tone="blue">Activa</Badge>}
        </span>
      }
      subtitle={a.provider === 'cloud_api' ? 'WhatsApp Business Cloud API (oficial)' : 'Simulador (pruebas)'}
      actions={<Badge tone={st.tone} dot>{st.label}</Badge>}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Número conectado</dt>
          <dd className="font-medium">{a.phone_number ? '+' + a.phone_number : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Nombre verificado</dt>
          <dd className="font-medium">{a.display_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Última conexión</dt>
          <dd>{fmtDateTime(a.last_connected_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Última sincronización</dt>
          <dd>{fmtDateTime(a.last_sync_at)}</dd>
        </div>
        {a.quality_rating && (
          <div>
            <dt className="text-xs text-muted">Calidad del número (Meta)</dt>
            <dd>{a.quality_rating}</dd>
          </div>
        )}
        {a.status_detail && a.status !== 'connected' && (
          <div className="col-span-2">
            <InfoBox tone={a.status === 'error' ? 'danger' : 'warn'}>{a.status_detail}</InfoBox>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {a.status !== 'connected' ? (
          <Button variant="primary" size="sm" loading={busy === 'c'} icon={<Plug className="h-4 w-4" />} onClick={() => run('c', () => call('accounts.connect', { accountId: a.id }), '🟢 Conectado')}>
            {a.last_connected_at ? 'Reconectar' : 'Conectar'}
          </Button>
        ) : (
          <Button size="sm" loading={busy === 'r'} icon={<RefreshCw className="h-4 w-4" />} onClick={() => run('r', () => call('accounts.connect', { accountId: a.id }), 'Conexión actualizada')}>
            Actualizar conexión
          </Button>
        )}
        {a.status === 'connected' && a.id === accountId && can('templates.manage') && (
          <Button size="sm" loading={busy === 's'} icon={<RefreshCw className="h-4 w-4" />} onClick={() => run('s', async () => toast.success(`${(await call<{ count: number }>('accounts.syncTemplates')).count} plantillas sincronizadas`))}>
            Sincronizar plantillas
          </Button>
        )}
        {can('accounts.manage') && (
          <>
            {a.status === 'connected' && (
              <Button size="sm" variant="ghost" loading={busy === 'd'} icon={<Unplug className="h-4 w-4" />} onClick={() => run('d', () => call('accounts.disconnect', { accountId: a.id }), 'Desconectado')}>
                Desconectar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                if (await confirmDialog({ title: 'Eliminar cuenta', body: 'Se desconectará y se borrarán sus credenciales. Los datos históricos se conservan en la base de datos.', danger: true, requireText: a.name, confirmText: 'Eliminar' }))
                  await run('x', () => call('accounts.remove', { accountId: a.id }), 'Cuenta eliminada');
              }}
            >
              Eliminar
            </Button>
          </>
        )}
      </div>
      <EditCredentials account={a} open={edit} onClose={() => setEdit(false)} />
    </Card>
  );
}

export function WhatsAppSettings() {
  const { accounts, accountId, can } = useStore();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get('new') === '1');
  useAppEvent(['account.status'], () => void useStore.getState().refreshAccounts());
  const current = accounts.find((a) => a.id === accountId);
  return (
    <div className="space-y-5">
      {adding ? (
        <Card title="Agregar cuenta de WhatsApp">
          <AddAccount
            onDone={() => {
              setAdding(false);
              setParams({});
            }}
            onCancel={() => {
              setAdding(false);
              setParams({});
            }}
          />
        </Card>
      ) : (
        can('accounts.manage') && (
          <div className="flex justify-end">
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              Agregar cuenta
            </Button>
          </div>
        )
      )}
      <div className="grid grid-cols-2 gap-5">
        {accounts.map((a) => (
          <AccountCard key={a.id} a={a} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Capabilities />
        {current?.provider === 'simulator' ? <SimulatorPanel /> : current?.provider === 'cloud_api' ? <WebhookCard /> : null}
      </div>
    </div>
  );
}

function WebhookCard() {
  const st = useQuery<any>('accounts.webhookStatus');
  const [port, setPort] = useState(3977);
  const [host, setHost] = useState('127.0.0.1');
  useEffect(() => {
    if (st.data) {
      setPort(st.data.settings.port);
      setHost(st.data.settings.host);
    }
  }, [st.data]);
  return (
    <Card title="Servidor de webhooks" subtitle="Recepción de mensajes y estados de la Cloud API" actions={<Badge tone={st.data?.listening ? 'green' : 'red'} dot>{st.data?.listening ? 'Escuchando' : 'Detenido'}</Badge>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Puerto">
          <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </Field>
        <Field label="Interfaz" hint="127.0.0.1 si usa un túnel local (recomendado).">
          <Select value={host} onChange={(e) => setHost(e.target.value)}>
            <option value="127.0.0.1">127.0.0.1 (solo este equipo)</option>
            <option value="0.0.0.0">0.0.0.0 (red local)</option>
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => attempt(() => call('accounts.restartWebhook', { port, host }).then(st.reload), 'Servidor reiniciado')}>
          Aplicar y reiniciar
        </Button>
        <Button size="sm" variant="ghost" icon={<ExternalLink className="h-4 w-4" />} onClick={() => call('app.openExternal', { url: 'https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks' })}>
          Guía de Meta
        </Button>
      </div>
      {st.data?.lastEventAt && <p className="mt-3 text-xs text-muted">Último evento: {fmtDateTime(st.data.lastEventAt)}</p>}
      {st.data?.lastError && <InfoBox tone="danger" className="mt-3">{st.data.lastError}</InfoBox>}
      <div className="mt-4">
        <WebhookHelp />
      </div>
    </Card>
  );
}

/** Pantalla mostrada cuando todavía no existe ninguna cuenta de WhatsApp. */
export function Onboarding() {
  const { user, setSession } = useStore();
  return (
    <div className="h-full overflow-y-auto">
      <div className="drag fixed inset-x-0 top-0 h-10" />
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-xl shadow-emerald-500/30">
              <MessageCircle className="h-6 w-6 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Conectar WhatsApp</h1>
              <p className="text-sm text-muted">Hola {user?.display_name}. Elija cómo conectar su primera cuenta.</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={async () => (await call('auth.logout'), setSession(null, null))}>
            Salir
          </Button>
        </div>
        {user?.permissions.includes('accounts.manage') ? <AddAccount onDone={() => {}} /> : <InfoBox tone="warn">Un administrador debe agregar una cuenta de WhatsApp.</InfoBox>}
      </div>
    </div>
  );
}

