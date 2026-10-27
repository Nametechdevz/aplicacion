import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Share, Text } from 'react-native';
import { Boton, C, Campo, Entrada, Pantalla, Tarjeta, Titulo } from '../../components/ui';
import { exportarTodo, guardarAjustes, leerAjustes, type Ajustes } from '../../lib/db';
import { parseDecimal } from '../../lib/format';

export default function AjustesPantalla() {
  const db = useSQLiteContext();
  const [a, setA] = useState<Ajustes>({ placa: '', conductor: '', porcentaje: 10 });
  const [pct, setPct] = useState('10');

  useFocusEffect(
    useCallback(() => {
      leerAjustes(db).then((x) => {
        setA(x);
        setPct(String(x.porcentaje));
      });
    }, [db])
  );

  const guardar = async () => {
    const p = parseDecimal(pct);
    if (p == null || p < 0 || p > 100) return Alert.alert('Porcentaje inválido', 'Escribe un número entre 0 y 100.');
    await guardarAjustes(db, { ...a, porcentaje: p });
    Alert.alert('Listo', 'Ajustes guardados.');
  };

  const respaldo = async () => {
    const datos = await exportarTodo(db);
    await Share.share({ title: 'Respaldo Mi Camión', message: JSON.stringify(datos) });
  };

  return (
    <Pantalla>
      <Tarjeta>
        <Titulo>Camión y conductor</Titulo>
        <Campo etiqueta="Placa">
          <Entrada value={a.placa} onChangeText={(t) => setA({ ...a, placa: t.toUpperCase() })} placeholder="ABC123" autoCapitalize="characters" />
        </Campo>
        <Campo etiqueta="Conductor">
          <Entrada value={a.conductor} onChangeText={(t) => setA({ ...a, conductor: t })} placeholder="Nombre del conductor" />
        </Campo>
        <Campo etiqueta="Porcentaje del conductor (sobre el flete bruto)">
          <Entrada value={pct} onChangeText={setPct} keyboardType="decimal-pad" placeholder="10" />
        </Campo>
        <Text style={{ color: C.suave, fontSize: 12, marginBottom: 4 }}>
          Este porcentaje se usa por defecto en los viajes nuevos. Cada viaje guarda su propio porcentaje, así que cambiarlo no altera viajes anteriores.
        </Text>
        <Boton titulo="Guardar" onPress={guardar} />
      </Tarjeta>

      <Tarjeta>
        <Titulo>Respaldo</Titulo>
        <Text style={{ color: C.suave, marginBottom: 4 }}>
          Los datos se guardan solo en este celular. Envíate un respaldo (por WhatsApp o correo) de vez en cuando.
        </Text>
        <Boton titulo="Compartir respaldo" variante="secundario" onPress={respaldo} />
      </Tarjeta>
    </Pantalla>
  );
}
