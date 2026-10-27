import { useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { fechaLarga, fechaTexto, hoy, parseFechaTexto, parsePesos, pesos, sumarDias } from '../lib/format';

export const C = {
  fondo: '#F3F4F6',
  tarjeta: '#FFFFFF',
  texto: '#111827',
  suave: '#6B7280',
  borde: '#E5E7EB',
  primario: '#1F2937',
  acento: '#F59E0B',
  verde: '#15803D',
  rojo: '#B91C1C',
};

// ───────── Contenedores ─────────

export function Pantalla({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={s.pantalla}>{children}</View>;
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={s.titulo}>{children}</Text>;
}

export function Vacio({ texto }: { texto: string }) {
  return <Text style={s.vacio}>{texto}</Text>;
}

// ───────── Botones ─────────

type Variante = 'primario' | 'secundario' | 'peligro';

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado,
  style,
}: {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  deshabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      style={({ pressed }) => [
        s.boton,
        variante === 'secundario' && s.botonSec,
        variante === 'peligro' && s.botonPeligro,
        (pressed || deshabilitado) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[s.botonTexto, variante === 'secundario' && { color: C.primario }]}>{titulo}</Text>
    </Pressable>
  );
}

export function BotonFlotante({ onPress, texto = '+' }: { onPress: () => void; texto?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fab, pressed && { opacity: 0.8 }]}>
      <Text style={s.fabTexto}>{texto}</Text>
    </Pressable>
  );
}

export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, activo && s.chipActivo]}>
      <Text style={[s.chipTexto, activo && { color: '#fff' }]}>{texto}</Text>
    </Pressable>
  );
}

// ───────── Campos ─────────

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      {children}
    </View>
  );
}

export function Entrada(props: TextInputProps) {
  return <TextInput placeholderTextColor="#9CA3AF" {...props} style={[s.input, props.style]} />;
}

export function EntradaPesos({ valor, onChange, placeholder }: { valor: number; onChange: (n: number) => void; placeholder?: string }) {
  return (
    <Entrada
      keyboardType="number-pad"
      value={valor ? pesos(valor) : ''}
      placeholder={placeholder ?? '$ 0'}
      onChangeText={(t) => onChange(parsePesos(t))}
      style={{ fontSize: 20, fontWeight: '700' }}
    />
  );
}

export function EntradaFecha({ valor, onChange }: { valor: string; onChange: (iso: string) => void }) {
  const [texto, setTexto] = useState(fechaTexto(valor));
  const [editando, setEditando] = useState(false);

  const cambiar = (iso: string) => {
    onChange(iso);
    setTexto(fechaTexto(iso));
  };

  return (
    <View>
      <View style={s.fila}>
        <Pressable style={s.flecha} onPress={() => cambiar(sumarDias(valor, -1))}>
          <Text style={s.flechaTexto}>◀</Text>
        </Pressable>
        <Entrada
          value={editando ? texto : fechaTexto(valor)}
          onFocus={() => {
            setEditando(true);
            setTexto(fechaTexto(valor));
          }}
          onChangeText={(t) => {
            setTexto(t);
            const iso = parseFechaTexto(t);
            if (iso) onChange(iso);
          }}
          onBlur={() => setEditando(false)}
          placeholder="DD/MM/AAAA"
          keyboardType="numbers-and-punctuation"
          style={{ flex: 1, textAlign: 'center', marginHorizontal: 8 }}
        />
        <Pressable style={s.flecha} onPress={() => cambiar(sumarDias(valor, 1))}>
          <Text style={s.flechaTexto}>▶</Text>
        </Pressable>
      </View>
      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 4 }]}>
        <Text style={s.ayuda}>{fechaLarga(valor)}</Text>
        {valor !== hoy() && (
          <Pressable onPress={() => cambiar(hoy())}>
            <Text style={[s.ayuda, { color: C.acento, fontWeight: '700' }]}>Hoy</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ───────── Datos ─────────

export function Linea({
  etiqueta,
  valor,
  color,
  negrita,
}: {
  etiqueta: string;
  valor: string;
  color?: string;
  negrita?: boolean;
}) {
  return (
    <View style={s.linea}>
      <Text style={[s.lineaEtiqueta, negrita && { fontWeight: '700', color: C.texto }]}>{etiqueta}</Text>
      <Text style={[s.lineaValor, color ? { color } : null, negrita && { fontSize: 18 }]}>{valor}</Text>
    </View>
  );
}

export function Barra({ fraccion, color }: { fraccion: number; color: string }) {
  return (
    <View style={s.barraFondo}>
      <View style={[s.barra, { width: `${Math.max(2, Math.min(100, fraccion * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 16, paddingBottom: 100 },
  tarjeta: {
    backgroundColor: C.tarjeta,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borde,
  },
  titulo: { fontSize: 13, fontWeight: '700', color: C.suave, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  vacio: { textAlign: 'center', color: C.suave, marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
  boton: { backgroundColor: C.primario, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  botonSec: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.primario },
  botonPeligro: { backgroundColor: C.rojo },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.acento,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabTexto: { fontSize: 32, color: '#111', fontWeight: '600', marginTop: -2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.tarjeta,
    borderWidth: 1,
    borderColor: C.borde,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActivo: { backgroundColor: C.primario, borderColor: C.primario },
  chipTexto: { color: C.texto, fontWeight: '600', fontSize: 13 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: C.suave, marginBottom: 6 },
  input: {
    backgroundColor: C.tarjeta,
    borderWidth: 1,
    borderColor: C.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: C.texto,
  },
  ayuda: { fontSize: 12, color: C.suave },
  fila: { flexDirection: 'row', alignItems: 'center' },
  flecha: { padding: 12, backgroundColor: C.tarjeta, borderRadius: 10, borderWidth: 1, borderColor: C.borde },
  flechaTexto: { fontSize: 14, color: C.primario },
  linea: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  lineaEtiqueta: { color: C.suave, fontSize: 15, flex: 1 },
  lineaValor: { color: C.texto, fontSize: 15, fontWeight: '600' },
  barraFondo: { height: 8, backgroundColor: C.fondo, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  barra: { height: 8, borderRadius: 4 },
  item: {
    backgroundColor: C.tarjeta,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borde,
  },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: C.texto },
  itemSub: { fontSize: 13, color: C.suave, marginTop: 2 },
  itemValor: { fontSize: 15, fontWeight: '700' },
  insignia: {
    fontSize: 11,
    fontWeight: '700',
    color: C.verde,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
});
