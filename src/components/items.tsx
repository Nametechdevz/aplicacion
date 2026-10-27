import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { categoria } from '../lib/categorias';
import type { Gasto, Resumen, Viaje } from '../lib/db';
import { fechaCorta, pesos } from '../lib/format';
import { Barra, C, Linea, s, Tarjeta, Titulo } from './ui';

export function ItemViaje({ v, extra }: { v: Viaje; extra?: number }) {
  const ruta = [v.origen, v.destino].filter(Boolean).join(' → ') || 'Viaje sin ruta';
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/viaje/${v.id}`)}>
      <Text style={{ fontSize: 26, marginRight: 12 }}>🚚</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitulo} numberOfLines={1}>{ruta}</Text>
        <Text style={s.itemSub} numberOfLines={1}>
          {fechaCorta(v.fecha)}
          {v.cliente ? ` · ${v.cliente}` : ''}
          {extra != null ? ` · gastos ${pesos(extra)}` : ''}
        </Text>
        {v.corte_id ? <Text style={s.insignia}>Corte #{v.corte_id}</Text> : null}
      </View>
      <Text style={[s.itemValor, { color: C.verde }]}>{pesos(v.valor_flete)}</Text>
    </Pressable>
  );
}

export function ItemGasto({ g, viajeNombre }: { g: Gasto; viajeNombre?: string }) {
  const cat = categoria(g.categoria);
  return (
    <Pressable style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/gasto/form?id=${g.id}`)}>
      <Text style={{ fontSize: 24, marginRight: 12 }}>{cat.icono}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitulo} numberOfLines={1}>{g.descripcion || cat.nombre}</Text>
        <Text style={s.itemSub} numberOfLines={1}>
          {fechaCorta(g.fecha)} · {cat.nombre}
          {g.galones ? ` · ${g.galones} gal` : ''}
          {g.pagado_por === 'conductor' && !cat.esEntrega ? ' · pagó conductor' : ''}
          {viajeNombre ? ` · ${viajeNombre}` : ''}
        </Text>
        {g.corte_id ? <Text style={s.insignia}>Corte #{g.corte_id}</Text> : null}
      </View>
      <Text style={[s.itemValor, { color: cat.esEntrega ? C.primario : C.rojo }]}>
        {cat.esEntrega ? '' : '-'}{pesos(g.valor)}
      </Text>
    </Pressable>
  );
}

/** Tarjetas de resultado: utilidad, desglose y arreglo con el conductor */
export function TarjetasResumen({ r }: { r: Resumen }) {
  const max = r.porCategoria[0]?.total ?? 1;
  return (
    <>
      <Tarjeta style={{ backgroundColor: C.primario }}>
        <Text style={{ color: '#D1D5DB', fontSize: 13, fontWeight: '600' }}>UTILIDAD DEL CAMIÓN</Text>
        <Text style={{ color: r.utilidad >= 0 ? '#86EFAC' : '#FCA5A5', fontSize: 34, fontWeight: '800', marginVertical: 4 }}>
          {pesos(r.utilidad)}
        </Text>
        <Text style={{ color: '#D1D5DB', fontSize: 13 }}>
          {r.numViajes} {r.numViajes === 1 ? 'viaje' : 'viajes'}
          {r.km ? ` · ${pesos(r.km).replace('$ ', '')} km` : ''}
          {r.galones ? ` · ${r.galones.toFixed(1)} gal ACPM` : ''}
          {r.km && r.galones ? ` · ${(r.km / r.galones).toFixed(1)} km/gal` : ''}
        </Text>
      </Tarjeta>

      <Tarjeta>
        <Titulo>Cuentas</Titulo>
        <Linea etiqueta="Fletes (ingresos)" valor={pesos(r.totalFletes)} color={C.verde} />
        <Linea etiqueta="Gastos del camión" valor={`-${pesos(r.totalGastos)}`} color={C.rojo} />
        <Linea etiqueta="Porcentaje conductor" valor={`-${pesos(r.totalConductor)}`} color={C.rojo} />
        <View style={{ height: 1, backgroundColor: C.borde, marginVertical: 6 }} />
        <Linea etiqueta="Utilidad" valor={pesos(r.utilidad)} negrita color={r.utilidad >= 0 ? C.verde : C.rojo} />
      </Tarjeta>

      <Tarjeta>
        <Titulo>Arreglo con el conductor</Titulo>
        <Linea etiqueta="Su porcentaje" valor={pesos(r.totalConductor)} />
        <Linea etiqueta="+ Gastos que pagó él" valor={pesos(r.gastosConductor)} />
        <Linea etiqueta="− Plata que se le entregó" valor={pesos(r.entregas)} />
        <View style={{ height: 1, backgroundColor: C.borde, marginVertical: 6 }} />
        <Linea
          etiqueta={r.saldoConductor >= 0 ? 'Hay que pagarle' : 'Él debe devolver'}
          valor={pesos(Math.abs(r.saldoConductor))}
          negrita
          color={r.saldoConductor >= 0 ? C.primario : C.rojo}
        />
      </Tarjeta>

      {r.porCategoria.length > 0 && (
        <Tarjeta>
          <Titulo>Gastos por categoría</Titulo>
          {r.porCategoria.map((c) => {
            const cat = categoria(c.id);
            return (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <View style={[s.fila, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 14, color: C.texto }}>
                    {cat.icono} {cat.nombre}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.texto }}>{pesos(c.total)}</Text>
                </View>
                <Barra fraccion={c.total / max} color={cat.color} />
              </View>
            );
          })}
        </Tarjeta>
      )}
    </>
  );
}

/** Texto plano del corte para compartir por WhatsApp */
export function textoCorte(titulo: string, r: Resumen, viajes: Viaje[]): string {
  const l: string[] = [`🚚 ${titulo}`, ''];
  l.push(`Viajes: ${r.numViajes}`);
  for (const v of viajes) {
    l.push(`  • ${fechaCorta(v.fecha)} ${[v.origen, v.destino].filter(Boolean).join('→')}: ${pesos(v.valor_flete)}`);
  }
  l.push('', `Fletes: ${pesos(r.totalFletes)}`, `Gastos: -${pesos(r.totalGastos)}`);
  for (const c of r.porCategoria) l.push(`  • ${categoria(c.id).nombre}: ${pesos(c.total)}`);
  l.push(`Conductor: -${pesos(r.totalConductor)}`, `UTILIDAD: ${pesos(r.utilidad)}`, '');
  l.push('Arreglo conductor:');
  l.push(`  Porcentaje ${pesos(r.totalConductor)} + gastos pagados ${pesos(r.gastosConductor)} − entregado ${pesos(r.entregas)}`);
  l.push(
    r.saldoConductor >= 0
      ? `  Se le paga: ${pesos(r.saldoConductor)}`
      : `  Debe devolver: ${pesos(-r.saldoConductor)}`
  );
  return l.join('\n');
}
