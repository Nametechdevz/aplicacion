import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, FileUp, Upload } from 'lucide-react';
import type { CustomField, Tag } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast } from '../lib/store';
import { fmtNum } from '../lib/format';
import { Badge, Button, Field, InfoBox, Input, Modal, Select, TagChip, Toggle, cx } from '../components/ui';

const ISSUE_LABEL: Record<string, string> = { invalid_phone: 'Números inválidos', duplicate_file: 'Duplicados en el archivo', duplicate_existing: 'Ya existen', incomplete: 'Filas incompletas', invalid_email: 'Emails inválidos' };

export function ImportWizard({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'pick' | 'map' | 'done'>('pick');
  const [file, setFile] = useState<{ token: string; fileName: string } | null>(null);
  const [an, setAn] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState({ updateExisting: false, consent: 'unknown' as 'unknown' | 'opted_in', consentSource: '', tagIds: [] as number[], runAutomations: false });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fields = useQuery<CustomField[]>(open ? 'fields.list' : null);
  const tags = useQuery<Tag[]>(open ? 'tags.list' : null);

  const reset = () => {
    setStep('pick');
    setFile(null);
    setAn(null);
    setResult(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const pick = async () => {
    const f = await attempt(() => call<{ token: string; fileName: string } | null>('import.pick'));
    if (!f) return;
    setFile(f);
    const a = await attempt(() => call<any>('import.analyze', { token: f.token }));
    if (a) {
      setAn(a);
      setMapping(a.mapping);
      setStep('map');
    }
  };
  const reanalyze = async (m: Record<string, string>) => {
    setMapping(m);
    const a = await attempt(() => call<any>('import.analyze', { token: file!.token, mapping: m }));
    if (a) setAn(a);
  };
  const execute = async () => {
    setBusy(true);
    const r = await attempt(() => call<any>('import.execute', { token: file!.token, mapping, ...opts, consentSource: opts.consentSource || null }));
    setBusy(false);
    if (r) {
      setResult(r);
      setStep('done');
      onDone();
      toast.success('Importación completada', `${r.created} creados, ${r.updated} actualizados`);
    }
  };
  const hasPhone = Object.values(mapping).includes('phone');
  const options = [
    { v: 'ignore', l: '— Ignorar —' },
    { v: 'name', l: 'Nombre' },
    { v: 'first_name', l: 'Primer nombre' },
    { v: 'last_name', l: 'Apellido' },
    { v: 'phone', l: 'Teléfono' },
    { v: 'email', l: 'Email' },
    { v: 'company', l: 'Empresa' },
    { v: 'tags', l: 'Etiquetas (separadas por ;)' },
    ...(fields.data ?? []).map((f) => ({ v: `custom:${f.key}`, l: `Campo: ${f.label}` })),
  ];
  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Importar contactos"
      subtitle={file?.fileName}
      closeOnBackdrop={false}
      footer={
        step === 'map' ? (
          <>
            <Button variant="ghost" onClick={reset}>
              Elegir otro archivo
            </Button>
            <Button variant="primary" loading={busy} disabled={!hasPhone || !an?.valid && !opts.updateExisting} onClick={execute} icon={<Upload className="h-4 w-4" />}>
              Importar {fmtNum(an?.valid ?? 0)} contactos nuevos
            </Button>
          </>
        ) : step === 'done' ? (
          <Button variant="primary" onClick={close}>
            Cerrar
          </Button>
        ) : null
      }
    >
      {step === 'pick' && (
        <div className="space-y-5">
          <button onClick={pick} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line p-10 transition hover:border-brand hover:bg-brand/5">
            <FileUp className="h-10 w-10 text-brand" />
            <p className="mt-3 font-medium">Seleccionar archivo CSV</p>
            <p className="text-sm text-muted">Columnas sugeridas: nombre, telefono, email, empresa, etiqueta</p>
          </button>
          <div className="flex items-center justify-between rounded-xl bg-elevated/50 p-4 text-sm">
            <span>¿No tiene un archivo? Descargue una plantilla con el formato correcto.</span>
            <Button size="sm" icon={<FileDown className="h-4 w-4" />} onClick={() => attempt(() => call('import.template'))}>
              Descargar plantilla
            </Button>
          </div>
          <InfoBox tone="info">Importe solo contactos que aceptaron recibir mensajes. Las importaciones no disparan automatizaciones de "Contacto creado" salvo que lo active explícitamente.</InfoBox>
        </div>
      )}
      {step === 'map' && an && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <p className="text-2xl font-semibold text-emerald-400">{fmtNum(an.valid)}</p>
              <p className="text-xs text-muted">Nuevos válidos</p>
            </div>
            {Object.entries(an.counts).map(([k, v]) => (
              <div key={k} className={cx('rounded-xl p-3', (v as number) > 0 ? 'bg-amber-500/10' : 'bg-elevated/50')}>
                <p className={cx('text-2xl font-semibold', (v as number) > 0 && 'text-amber-400')}>{fmtNum(v as number)}</p>
                <p className="text-xs text-muted">{ISSUE_LABEL[k]}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="label">Columnas del archivo ({fmtNum(an.totalRows)} filas)</p>
            <div className="grid grid-cols-3 gap-3">
              {an.headers.map((h: string) => (
                <div key={h} className="rounded-xl border border-line/60 p-3">
                  <p className="mb-1 truncate text-sm font-medium">{h}</p>
                  <p className="mb-2 truncate text-xs text-muted">ej. {an.sample[0]?.[h] || '—'}</p>
                  <Select value={mapping[h]} onChange={(e) => reanalyze({ ...mapping, [h]: e.target.value })}>
                    {options.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            {!hasPhone && <InfoBox tone="danger" className="mt-3">Indique qué columna contiene el teléfono.</InfoBox>}
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-4">
              <Toggle checked={opts.updateExisting} onChange={(v) => setOpts({ ...opts, updateExisting: v })} label="Actualizar contactos que ya existen" hint="Completa datos y agrega etiquetas a los contactos duplicados." />
              <Toggle checked={opts.runAutomations} onChange={(v) => setOpts({ ...opts, runAutomations: v })} label='Ejecutar automatizaciones de "Contacto creado"' hint="Desactivado por seguridad: evita mensajes masivos accidentales." />
              <Field label="Consentimiento">
                <Select value={opts.consent} onChange={(e) => setOpts({ ...opts, consent: e.target.value as any })}>
                  <option value="unknown">Sin registrar</option>
                  <option value="opted_in">Todos aceptaron recibir mensajes (opt-in)</option>
                </Select>
              </Field>
              {opts.consent === 'opted_in' && (
                <Field label="Fuente del consentimiento" hint="Ej. formulario web, evento, compra.">
                  <Input value={opts.consentSource} onChange={(e) => setOpts({ ...opts, consentSource: e.target.value })} />
                </Field>
              )}
            </div>
            <div>
              <p className="label">Agregar etiquetas a todos los importados</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.data?.filter((t) => !t.is_system).map((t) => (
                  <button key={t.id} type="button" onClick={() => setOpts({ ...opts, tagIds: opts.tagIds.includes(t.id) ? opts.tagIds.filter((x) => x !== t.id) : [...opts.tagIds, t.id] })} className={cx(!opts.tagIds.includes(t.id) && 'opacity-40 grayscale')}>
                    <TagChip tag={t} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          {an.issues.length > 0 && (
            <div>
              <p className="label">Detalle de problemas</p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-line/60 text-sm">
                {an.issues.slice(0, 200).map((is: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 border-b border-line/40 px-3 py-1.5 last:border-0">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    <span className="w-16 text-xs text-muted">Fila {is.row}</span>
                    <Badge tone="amber">{ISSUE_LABEL[is.kind]}</Badge>
                    <span className="flex-1 truncate text-xs">{is.message}</span>
                    {is.value && <code className="text-xs text-muted">{is.value}</code>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <div>
              <p className="text-lg font-semibold">Importación completada</p>
              <p className="text-sm text-muted">Lote: {result.batchId} — puede usarlo como audiencia "Importados" en una campaña.</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              ['Creados', result.created, 'text-emerald-400'],
              ['Actualizados', result.updated, 'text-sky-400'],
              ['Omitidos', result.skipped, 'text-muted'],
              ['Con errores', result.failed + result.counts.invalid_phone + result.counts.incomplete + result.counts.duplicate_file, 'text-amber-400'],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-xl bg-elevated/50 p-4">
                <p className={cx('text-2xl font-semibold', c as string)}>{fmtNum(v as number)}</p>
                <p className="text-xs text-muted">{l}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
