import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { BotonFlotante, C, Pantalla, s, Vacio } from '../../components/ui';
import { listarCortes, type Corte } from '../../lib/db';
import { pesos, rango } from '../../lib/format';

export default function Cortes() {
  const db = useSQLiteContext();
  const [cortes, setCortes] = useState<Corte[]>([]);

  useFocusEffect(
    useCallback(() => {
      listarCortes(db).then(setCortes);
    }, [db])
  );

  const acumulado = cortes.reduce((t, c) => t + c.utilidad, 0);

  return (
    <Pantalla scroll={false}>
      <FlatList
        data={cortes}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          cortes.length > 0 ? (
            <Text style={{ color: C.suave, marginBottom: 10 }}>
              {cortes.length} cortes · utilidad acumulada{' '}
              <Text style={{ fontWeight: '700', color: acumulado >= 0 ? C.verde : C.rojo }}>{pesos(acumulado)}</Text>
            </Text>
          ) : undefined
        }
        renderItem={({ item: c }) => (
          <Pressable style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/corte/${c.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitulo}>
                Corte #{c.id} · {rango(c.fecha_inicio, c.fecha_fin)}
              </Text>
              <Text style={s.itemSub}>
                Fletes {pesos(c.total_fletes)} · Gastos {pesos(c.total_gastos)}
              </Text>
              <Text style={s.itemSub}>
                Conductor: {c.saldo_conductor >= 0 ? `se le paga ${pesos(c.saldo_conductor)}` : `devuelve ${pesos(-c.saldo_conductor)}`}
              </Text>
            </View>
            <Text style={[s.itemValor, { color: c.utilidad >= 0 ? C.verde : C.rojo }]}>{pesos(c.utilidad)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Vacio texto="Todavía no hay cortes. Al final de la semana toca + para cerrar las cuentas y hacer el arreglo con el conductor." />
        }
      />
      <BotonFlotante onPress={() => router.push('/corte/nuevo')} texto="✂️" />
    </Pantalla>
  );
}
