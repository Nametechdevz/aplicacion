export type CategoriaId =
  | 'acpm'
  | 'peaje'
  | 'policia'
  | 'llanteria'
  | 'taller'
  | 'repuestos'
  | 'lavado'
  | 'parqueadero'
  | 'comida'
  | 'cargue'
  | 'documentos'
  | 'otros'
  | 'entrega_conductor';

export interface Categoria {
  id: CategoriaId;
  nombre: string;
  icono: string;
  color: string;
  /** Las entregas al conductor no son gasto del camión: se descuentan en el arreglo */
  esEntrega?: boolean;
}

export const CATEGORIAS: Categoria[] = [
  { id: 'acpm', nombre: 'ACPM', icono: '⛽', color: '#D97706' },
  { id: 'peaje', nombre: 'Peajes', icono: '🛣️', color: '#2563EB' },
  { id: 'policia', nombre: 'Policía / retenes', icono: '👮', color: '#4B5563' },
  { id: 'llanteria', nombre: 'Llantería', icono: '🛞', color: '#7C3AED' },
  { id: 'taller', nombre: 'Taller / mecánica', icono: '🔧', color: '#DC2626' },
  { id: 'repuestos', nombre: 'Repuestos / aceite', icono: '⚙️', color: '#B45309' },
  { id: 'lavado', nombre: 'Lavado', icono: '🧽', color: '#0891B2' },
  { id: 'parqueadero', nombre: 'Parqueadero', icono: '🅿️', color: '#0D9488' },
  { id: 'comida', nombre: 'Comida / viáticos', icono: '🍽️', color: '#EA580C' },
  { id: 'cargue', nombre: 'Cargue / descargue', icono: '📦', color: '#65A30D' },
  { id: 'documentos', nombre: 'SOAT / técnico / seguros', icono: '📄', color: '#9333EA' },
  { id: 'otros', nombre: 'Otros', icono: '➕', color: '#6B7280' },
  {
    id: 'entrega_conductor',
    nombre: 'Plata entregada al conductor',
    icono: '💵',
    color: '#16A34A',
    esEntrega: true,
  },
];

export function categoria(id: string): Categoria {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 2];
}
