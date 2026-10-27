import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Share, Text } from 'react-native';
import { ItemGasto, ItemViaje, TarjetasResumen, textoCorte } from '../../components/items';
import { Boton, Pantalla, s, Tarjeta, Titulo, Vacio } from '../../components/ui';
import { calcularResumen, leerAjustes, obtenerCorte, reabrirCorte, type Corte, type Gasto, type Viaje } from '../../lib/db';
import { rango } from '../../lib/format';

export default function DetalleCorte() {
  const db = useSQLiteContext();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [datos, setDatos] = useState<{ corte: Corte | null; viajes: Viaje[]; gastos: Gasto[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenerCorte(db, id).then(setDatos);
    }, [db, id])
  );

  if (!datos) return <Vacio texto="Cargando…" />;
  const { corte, viajes, gastos } = datos;
  if (!corte) return <Vacio texto="Este corte ya no existe." />;

  // Se recalcula desde los movimientos para mostrar el desglose por categoría
  const r = calcularResumen(viajes, gastos);
  const titulo = `Corte #${corte.id} · ${rango(corte.fecha_inicio, corte.fecha_fin)}`;

  const compartir = async () => {
    const a = await leerAjustes(db);
    const cab = [titulo, a.placa && `Placa ${a.placa}`, a.conductor && `Conductor ${a.conductor}`].filter(Boolean).join(' · ');
    await Share.share({ message: textoCorte(cab, r, viajes) + (corte.notas ? `\n\nNotas: ${corte.notas}` : '') });
  };

  const reabrir = () =>
    Alert.alert(
      '¿Reabrir este corte?',
      'El corte se elimina y sus viajes y gastos vuelven a quedar pendientes para editarlos o cortarlos de nuevo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reabrir',
          style: 'destructive',
          onPress: async () => {
            await reabrirCorte(db, id);
            router.back();
          },
        },
      ]
    );

  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Corte #${corte.id}` }} />
      <Text style={[s.itemTitulo, { fontSize: 17, marginBottom: 10 }]}>{rango(corte.fecha_inicio, corte.fecha_fin)}</Text>
      <TarjetasResumen r={r} />
      {corte.notas ? (
        <Tarjeta>
          <Titulo>Notas</Titulo>
          <Text>{corte.notas}</Text>
        </Tarjeta>
      ) : null}
      <Boton titulo="📤 Compartir por WhatsApp" onPress={compartir} />

      {viajes.length > 0 && <Titulo>{`\nViajes (${viajes.length})`}</Titulo>}
      {viajes.map((v) => (
        <ItemViaje key={v.id} v={v} />
      ))}
      {gastos.length > 0 && <Titulo>{`\nGastos (${gastos.length})`}</Titulo>}
      {gastos.map((g) => (
        <ItemGasto key={g.id} g={g} />
      ))}

      <Boton titulo="Reabrir corte" variante="secundario" onPress={reabrir} style={{ marginTop: 16 }} />
    </Pantalla>
  );
}
