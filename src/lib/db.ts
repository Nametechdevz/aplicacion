import type { SQLiteDatabase } from 'expo-sqlite';
import { categoria } from './categorias';

// ───────────────────────── Tipos ─────────────────────────

export interface Viaje {
  id: number;
  fecha: string;
  origen: string;
  destino: string;
  cliente: string;
  carga: string;
  valor_flete: number;
  porcentaje: number; // % del conductor sobre el flete bruto
  km_inicio: number | null;
  km_fin: number | null;
  notas: string;
  corte_id: number | null;
}

export type PagadoPor = 'dueno' | 'conductor';

export interface Gasto {
  id: number;
  fecha: string;
  categoria: string;
  descripcion: string;
  valor: number;
  galones: number | null;
  pagado_por: PagadoPor;
  viaje_id: number | null;
  corte_id: number | null;
}

export interface Corte {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  total_fletes: number;
  total_gastos: number;
  total_conductor: number;
  gastos_conductor: number;
  entregas: number;
  saldo_conductor: number;
  utilidad: number;
  notas: string;
  created_at: string;
}

export interface Ajustes {
  placa: string;
  conductor: string;
  porcentaje: number;
}

// ───────────────────────── Migraciones ─────────────────────────

const VERSION_DB = 1;

export async function migrar(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = fila?.user_version ?? 0;
  if (version >= VERSION_DB) return;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE cortes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        total_fletes REAL NOT NULL DEFAULT 0,
        total_gastos REAL NOT NULL DEFAULT 0,
        total_conductor REAL NOT NULL DEFAULT 0,
        gastos_conductor REAL NOT NULL DEFAULT 0,
        entregas REAL NOT NULL DEFAULT 0,
        saldo_conductor REAL NOT NULL DEFAULT 0,
        utilidad REAL NOT NULL DEFAULT 0,
        notas TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE viajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        origen TEXT NOT NULL DEFAULT '',
        destino TEXT NOT NULL DEFAULT '',
        cliente TEXT NOT NULL DEFAULT '',
        carga TEXT NOT NULL DEFAULT '',
        valor_flete REAL NOT NULL DEFAULT 0,
        porcentaje REAL NOT NULL DEFAULT 0,
        km_inicio REAL,
        km_fin REAL,
        notas TEXT NOT NULL DEFAULT '',
        corte_id INTEGER REFERENCES cortes(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        categoria TEXT NOT NULL,
        descripcion TEXT NOT NULL DEFAULT '',
        valor REAL NOT NULL DEFAULT 0,
        galones REAL,
        pagado_por TEXT NOT NULL DEFAULT 'dueno',
        viaje_id INTEGER REFERENCES viajes(id) ON DELETE SET NULL,
        corte_id INTEGER REFERENCES cortes(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE INDEX idx_viajes_fecha ON viajes(fecha);
      CREATE INDEX idx_gastos_fecha ON gastos(fecha);
      CREATE INDEX idx_gastos_viaje ON gastos(viaje_id);
      INSERT INTO ajustes (clave, valor) VALUES ('porcentaje', '10'), ('placa', ''), ('conductor', '');
    `);
    version = 1;
  }
  // Futuras migraciones: if (version === 1) { ...; version = 2; }

  await db.execAsync(`PRAGMA user_version = ${VERSION_DB}`);
}

// ───────────────────────── Ajustes ─────────────────────────

export async function leerAjustes(db: SQLiteDatabase): Promise<Ajustes> {
  const filas = await db.getAllAsync<{ clave: string; valor: string }>('SELECT * FROM ajustes');
  const m = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  return {
    placa: m.placa ?? '',
    conductor: m.conductor ?? '',
    porcentaje: parseFloat(m.porcentaje ?? '10') || 0,
  };
}

export async function guardarAjustes(db: SQLiteDatabase, a: Ajustes) {
  await db.withTransactionAsync(async () => {
    for (const [clave, valor] of Object.entries(a)) {
      await db.runAsync('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)', clave, String(valor));
    }
  });
}

// ───────────────────────── Viajes ─────────────────────────

export type ViajeInput = Omit<Viaje, 'id' | 'corte_id'>;

export async function listarViajes(db: SQLiteDatabase, desde?: string, hasta?: string) {
  if (desde && hasta) {
    return db.getAllAsync<Viaje>(
      'SELECT * FROM viajes WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC',
      desde,
      hasta
    );
  }
  return db.getAllAsync<Viaje>('SELECT * FROM viajes ORDER BY fecha DESC, id DESC');
}

export async function obtenerViaje(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Viaje>('SELECT * FROM viajes WHERE id = ?', id);
}

export async function guardarViaje(db: SQLiteDatabase, v: ViajeInput, id?: number) {
  const vals = [
    v.fecha, v.origen.trim(), v.destino.trim(), v.cliente.trim(), v.carga.trim(),
    v.valor_flete, v.porcentaje, v.km_inicio, v.km_fin, v.notas.trim(),
  ];
  if (id) {
    await db.runAsync(
      `UPDATE viajes SET fecha=?, origen=?, destino=?, cliente=?, carga=?, valor_flete=?,
       porcentaje=?, km_inicio=?, km_fin=?, notas=? WHERE id=?`,
      ...vals, id
    );
    return id;
  }
  const r = await db.runAsync(
    `INSERT INTO viajes (fecha, origen, destino, cliente, carga, valor_flete, porcentaje, km_inicio, km_fin, notas)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ...vals
  );
  return r.lastInsertRowId;
}

export async function eliminarViaje(db: SQLiteDatabase, id: number, conGastos: boolean) {
  await db.withTransactionAsync(async () => {
    if (conGastos) await db.runAsync('DELETE FROM gastos WHERE viaje_id = ?', id);
    await db.runAsync('DELETE FROM viajes WHERE id = ?', id);
  });
}

// ───────────────────────── Gastos ─────────────────────────

export type GastoInput = Omit<Gasto, 'id' | 'corte_id'>;

export async function listarGastos(db: SQLiteDatabase, opts: { desde?: string; hasta?: string; viajeId?: number } = {}) {
  if (opts.viajeId) {
    return db.getAllAsync<Gasto>('SELECT * FROM gastos WHERE viaje_id = ? ORDER BY fecha DESC, id DESC', opts.viajeId);
  }
  if (opts.desde && opts.hasta) {
    return db.getAllAsync<Gasto>(
      'SELECT * FROM gastos WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, id DESC',
      opts.desde,
      opts.hasta
    );
  }
  return db.getAllAsync<Gasto>('SELECT * FROM gastos ORDER BY fecha DESC, id DESC');
}

export async function obtenerGasto(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Gasto>('SELECT * FROM gastos WHERE id = ?', id);
}

export async function guardarGasto(db: SQLiteDatabase, g: GastoInput, id?: number) {
  const vals = [g.fecha, g.categoria, g.descripcion.trim(), g.valor, g.galones, g.pagado_por, g.viaje_id];
  if (id) {
    await db.runAsync(
      'UPDATE gastos SET fecha=?, categoria=?, descripcion=?, valor=?, galones=?, pagado_por=?, viaje_id=? WHERE id=?',
      ...vals, id
    );
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO gastos (fecha, categoria, descripcion, valor, galones, pagado_por, viaje_id) VALUES (?,?,?,?,?,?,?)',
    ...vals
  );
  return r.lastInsertRowId;
}

export async function eliminarGasto(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM gastos WHERE id = ?', id);
}

// ───────────────────────── Cálculos ─────────────────────────

export interface Resumen {
  totalFletes: number;
  totalGastos: number; // gastos del camión (sin entregas al conductor)
  totalConductor: number; // % del conductor sobre fletes brutos
  gastosConductor: number; // gastos que el conductor pagó de su bolsillo
  entregas: number; // plata entregada al conductor
  saldoConductor: number; // >0: el dueño le debe al conductor; <0: el conductor debe devolver
  utilidad: number;
  galones: number;
  km: number;
  numViajes: number;
  porCategoria: { id: string; total: number }[];
}

export function calcularResumen(viajes: Viaje[], gastos: Gasto[]): Resumen {
  const totalFletes = viajes.reduce((s, v) => s + v.valor_flete, 0);
  const totalConductor = viajes.reduce((s, v) => s + (v.valor_flete * v.porcentaje) / 100, 0);
  const km = viajes.reduce(
    (s, v) => s + (v.km_inicio != null && v.km_fin != null && v.km_fin > v.km_inicio ? v.km_fin - v.km_inicio : 0),
    0
  );

  let totalGastos = 0;
  let gastosConductor = 0;
  let entregas = 0;
  let galones = 0;
  const cats = new Map<string, number>();

  for (const g of gastos) {
    if (categoria(g.categoria).esEntrega) {
      entregas += g.valor;
      continue;
    }
    totalGastos += g.valor;
    if (g.pagado_por === 'conductor') gastosConductor += g.valor;
    if (g.galones) galones += g.galones;
    cats.set(g.categoria, (cats.get(g.categoria) ?? 0) + g.valor);
  }

  return {
    totalFletes,
    totalGastos,
    totalConductor: Math.round(totalConductor),
    gastosConductor,
    entregas,
    saldoConductor: Math.round(totalConductor + gastosConductor - entregas),
    utilidad: Math.round(totalFletes - totalGastos - totalConductor),
    galones,
    km,
    numViajes: viajes.length,
    porCategoria: [...cats.entries()].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total),
  };
}

// ───────────────────────── Cortes ─────────────────────────

/** Movimientos pendientes (sin corte) que entrarían en un corte del rango dado */
export async function pendientesCorte(db: SQLiteDatabase, desde: string, hasta: string) {
  const viajes = await db.getAllAsync<Viaje>(
    'SELECT * FROM viajes WHERE corte_id IS NULL AND fecha BETWEEN ? AND ? ORDER BY fecha, id',
    desde,
    hasta
  );
  const ids = viajes.map((v) => v.id);
  const marcadores = ids.length ? ids.map(() => '?').join(',') : 'NULL';
  // Entran: (1) todos los gastos de los viajes incluidos, aunque tengan otra fecha;
  // (2) gastos sueltos del rango; (3) gastos del rango ligados a un viaje que ya se cortó.
  const gastos = await db.getAllAsync<Gasto>(
    `SELECT * FROM gastos WHERE corte_id IS NULL AND (
        viaje_id IN (${marcadores})
        OR (fecha BETWEEN ? AND ? AND (
              viaje_id IS NULL
              OR viaje_id IN (SELECT id FROM viajes WHERE corte_id IS NOT NULL)))
     ) ORDER BY fecha, id`,
    ...ids, desde, hasta
  );
  return { viajes, gastos };
}

export async function cerrarCorte(db: SQLiteDatabase, desde: string, hasta: string, notas: string) {
  let corteId = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const { viajes, gastos } = await pendientesCorte(tx, desde, hasta);
    const r = calcularResumen(viajes, gastos);
    const res = await tx.runAsync(
      `INSERT INTO cortes (fecha_inicio, fecha_fin, total_fletes, total_gastos, total_conductor,
        gastos_conductor, entregas, saldo_conductor, utilidad, notas) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      desde, hasta, r.totalFletes, r.totalGastos, r.totalConductor,
      r.gastosConductor, r.entregas, r.saldoConductor, r.utilidad, notas.trim()
    );
    corteId = res.lastInsertRowId;
    for (const v of viajes) await tx.runAsync('UPDATE viajes SET corte_id = ? WHERE id = ?', corteId, v.id);
    for (const g of gastos) await tx.runAsync('UPDATE gastos SET corte_id = ? WHERE id = ?', corteId, g.id);
  });
  return corteId;
}

export async function listarCortes(db: SQLiteDatabase) {
  return db.getAllAsync<Corte>('SELECT * FROM cortes ORDER BY fecha_fin DESC, id DESC');
}

export async function obtenerCorte(db: SQLiteDatabase, id: number) {
  const corte = await db.getFirstAsync<Corte>('SELECT * FROM cortes WHERE id = ?', id);
  const viajes = await db.getAllAsync<Viaje>('SELECT * FROM viajes WHERE corte_id = ? ORDER BY fecha, id', id);
  const gastos = await db.getAllAsync<Gasto>('SELECT * FROM gastos WHERE corte_id = ? ORDER BY fecha, id', id);
  return { corte, viajes, gastos };
}

/** Deshace un corte: los viajes y gastos vuelven a quedar pendientes */
export async function reabrirCorte(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE viajes SET corte_id = NULL WHERE corte_id = ?', id);
    await db.runAsync('UPDATE gastos SET corte_id = NULL WHERE corte_id = ?', id);
    await db.runAsync('DELETE FROM cortes WHERE id = ?', id);
  });
}

// ───────────────────────── Respaldo ─────────────────────────

export async function exportarTodo(db: SQLiteDatabase) {
  return {
    app: 'mi-camion',
    version: VERSION_DB,
    exportado: new Date().toISOString(),
    ajustes: await leerAjustes(db),
    viajes: await db.getAllAsync('SELECT * FROM viajes'),
    gastos: await db.getAllAsync('SELECT * FROM gastos'),
    cortes: await db.getAllAsync('SELECT * FROM cortes'),
  };
}
