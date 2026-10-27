import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ItemGasto, TarjetasResumen } from '../../components/items';
import { Boton, C, Linea, Pantalla, s, Tarjeta, Titulo, Vacio } from '../../components/ui';
import { calcularResumen, eliminarViaje, listarGastos, obtenerViaje, type Gasto, type Viaje } from '../../lib/db';
import { fechaLarga, pesos } from '../../lib/format';

export default function DetalleViaje() {
  const db = useSQLiteContext();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [v, setV] = useState<Viaje | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setV(await obtenerViaje(db, id));
        setGastos(await listarGastos(db, { viajeId: id }));
      })();
    }, [db, id])
  );

  if (!v) return <Vacio texto="Cargando…" />;

  const r = calcularResumen([v], gastos);
  const bloqueado = !!v.corte_id;

  const borrar = () => {
    const opciones = [
      { text: 'Cancelar', style: 'cancel' as const },
      ...(gastos.length
        ? [
            {
              text: 'Borrar viaje y sus gastos',
              style: 'destructive' as const,
              onPress: async () => {
                await eliminarViaje(db, id, true);
                router.back();
              },
            },
            {
              text: 'Borrar solo el viaje',
              onPress: async () => {
                await eliminarViaje(db, id, false);
                router.back();
              },
            },
          ]
        : [
            {
              text: 'Borrar',
              style: 'destructive' as const,
              onPress: async () => {
                await eliminarViaje(db, id, false);
                router.back();
              },
            },
          ]),
    ];
    Alert.alert('¿Borrar este viaje?', gastos.length ? `Tiene ${gastos.length} gastos asociados.` : undefined, opciones);
  };

  return (
    <Pantalla>
      <Tarjeta>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.texto }}>
          {[v.origen, v.destino].filter(Boolean).join(' → ')}
        </Text>
        <Text style={s.itemSub}>{fechaLarga(v.fecha)}</Text>
        {v.cliente ? <Linea etiqueta="Cliente" valor={v.cliente} /> : null}
        {v.carga ? <Linea etiqueta="Carga" valor={v.carga} /> : null}
        <Linea etiqueta="Flete" valor={pesos(v.valor_flete)} color={C.verde} />
        <Linea etiqueta={`Conductor (${v.porcentaje}%)`} valor={pesos(r.totalConductor)} />
        {v.km_inicio != null && v.km_fin != null ? (
          <Linea etiqueta="Kilometraje" valor={`${v.km_inicio} → ${v.km_fin} (${v.km_fin - v.km_inicio} km)`} />
        ) : null}
        {v.notas ? <Text style={[s.itemSub, { marginTop: 6 }]}>{v.notas}</Text> : null}
        {bloqueado && <Text style={s.insignia}>Incluido en el corte #{v.corte_id}</Text>}
      </Tarjeta>

      <TarjetasResumen r={r} />

      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 4 }]}>
        <Titulo>Gastos del viaje</Titulo>
      </View>
      {gastos.length === 0 ? (
        <Text style={[s.ayuda, { marginBottom: 8 }]}>Sin gastos registrados.</Text>
      ) : (
        gastos.map((g) => <ItemGasto key={g.id} g={g} />)
      )}

      <Boton
        titulo="+ Agregar gasto a este viaje"
        onPress={() => router.push(`/gasto/form?viajeId=${id}&fecha=${v.fecha}`)}
        style={{ backgroundColor: C.acento }}
      />
      {!bloqueado && (
        <>
          <Boton titulo="Editar viaje" variante="secundario" onPress={() => router.push(`/viaje/form?id=${id}`)} />
          <Boton titulo="Borrar viaje" variante="peligro" onPress={borrar} />
        </>
      )}
    </Pantalla>
  );
}
