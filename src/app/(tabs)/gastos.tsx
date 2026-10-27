import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { ItemGasto } from '../../components/items';
import { BotonFlotante, C, Chip, Pantalla, Vacio } from '../../components/ui';
import { CATEGORIAS, categoria } from '../../lib/categorias';
import { listarGastos, listarViajes, type Gasto } from '../../lib/db';
import { pesos } from '../../lib/format';

export default function Gastos() {
  const db = useSQLiteContext();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [rutas, setRutas] = useState<Record<number, string>>({});
  const [filtro, setFiltro] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setGastos(await listarGastos(db));
        const viajes = await listarViajes(db);
        setRutas(Object.fromEntries(viajes.map((v) => [v.id, v.destino || v.origen || `Viaje ${v.id}`])));
      })();
    }, [db])
  );

  const filtrados = useMemo(() => (filtro ? gastos.filter((g) => g.categoria === filtro) : gastos), [gastos, filtro]);
  const total = filtrados.reduce((s, g) => s + g.valor, 0);
  const usadas = new Set(gastos.map((g) => g.categoria));

  return (
    <Pantalla scroll={false}>
      <FlatList
        data={filtrados}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chip texto="Todos" activo={!filtro} onPress={() => setFiltro(null)} />
              {CATEGORIAS.filter((c) => usadas.has(c.id)).map((c) => (
                <Chip key={c.id} texto={`${c.icono} ${c.nombre}`} activo={filtro === c.id} onPress={() => setFiltro(c.id)} />
              ))}
            </ScrollView>
            {filtrados.length > 0 && (
              <Text style={{ color: C.suave, marginTop: 4 }}>
                {filtrados.length} registros · total {pesos(total)}
                {filtro ? ` en ${categoria(filtro).nombre}` : ''}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ItemGasto g={item} viajeNombre={item.viaje_id ? rutas[item.viaje_id] : undefined} />}
        ListEmptyComponent={<Vacio texto="Aún no hay gastos. Toca + para registrar ACPM, peajes, llantería…" />}
      />
      <BotonFlotante onPress={() => router.push('/gasto/form')} />
    </Pantalla>
  );
}
