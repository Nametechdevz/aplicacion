import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { ItemViaje } from '../../components/items';
import { BotonFlotante, Entrada, Pantalla, Vacio } from '../../components/ui';
import { listarViajes, type Viaje } from '../../lib/db';

export default function Viajes() {
  const db = useSQLiteContext();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [gastosPorViaje, setGastosPorViaje] = useState<Record<number, number>>({});
  const [buscar, setBuscar] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setViajes(await listarViajes(db));
        const filas = await db.getAllAsync<{ viaje_id: number; total: number }>(
          `SELECT viaje_id, SUM(valor) AS total FROM gastos
           WHERE viaje_id IS NOT NULL AND categoria <> 'entrega_conductor' GROUP BY viaje_id`
        );
        setGastosPorViaje(Object.fromEntries(filas.map((f) => [f.viaje_id, f.total])));
      })();
    }, [db])
  );

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return viajes;
    return viajes.filter((v) =>
      [v.origen, v.destino, v.cliente, v.carga, v.notas].some((t) => t.toLowerCase().includes(q))
    );
  }, [viajes, buscar]);

  return (
    <Pantalla scroll={false}>
      <FlatList
        data={filtrados}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Entrada placeholder="Buscar por ciudad, cliente o carga…" value={buscar} onChangeText={setBuscar} />
          </View>
        }
        renderItem={({ item }) => <ItemViaje v={item} extra={gastosPorViaje[item.id] ?? 0} />}
        ListEmptyComponent={<Vacio texto={buscar ? 'Ningún viaje coincide.' : 'Aún no hay viajes. Toca + para registrar el primero.'} />}
      />
      <BotonFlotante onPress={() => router.push('/viaje/form')} />
    </Pantalla>
  );
}
