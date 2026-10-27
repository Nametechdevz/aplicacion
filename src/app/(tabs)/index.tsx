import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TarjetasResumen } from '../../components/items';
import { Boton, C, Pantalla, s, Tarjeta } from '../../components/ui';
import { calcularResumen, listarGastos, listarViajes, type Resumen } from '../../lib/db';
import { hoy, rango, semanaDe, sumarDias } from '../../lib/format';

export default function Semana() {
  const db = useSQLiteContext();
  const [semana, setSemana] = useState(() => semanaDe(hoy()));
  const [r, setR] = useState<Resumen | null>(null);
  const [pendientes, setPendientes] = useState(0);

  const cargar = useCallback(async () => {
    const [viajes, gastos] = await Promise.all([
      listarViajes(db, semana.inicio, semana.fin),
      listarGastos(db, { desde: semana.inicio, hasta: semana.fin }),
    ]);
    setR(calcularResumen(viajes, gastos));
    setPendientes(viajes.filter((v) => !v.corte_id).length + gastos.filter((g) => !g.corte_id).length);
  }, [db, semana]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const mover = (dias: number) => setSemana(semanaDe(sumarDias(semana.inicio, dias)));
  const esActual = semana.inicio === semanaDe(hoy()).inicio;

  return (
    <Pantalla>
      <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <Pressable style={s.flecha} onPress={() => mover(-7)}>
          <Text style={s.flechaTexto}>◀</Text>
        </Pressable>
        <Pressable onPress={() => setSemana(semanaDe(hoy()))} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.texto }}>{rango(semana.inicio, semana.fin)}</Text>
          <Text style={s.ayuda}>{esActual ? 'Esta semana' : 'Toca para volver a esta semana'}</Text>
        </Pressable>
        <Pressable style={s.flecha} onPress={() => mover(7)}>
          <Text style={s.flechaTexto}>▶</Text>
        </Pressable>
      </View>

      <View style={[s.fila, { marginBottom: 12, gap: 8 }]}>
        <Boton titulo="+ Viaje" onPress={() => router.push('/viaje/form')} style={{ flex: 1, marginTop: 0 }} />
        <Boton
          titulo="+ Gasto"
          onPress={() => router.push('/gasto/form')}
          style={{ flex: 1, marginTop: 0, backgroundColor: C.acento }}
        />
      </View>

      {r && <TarjetasResumen r={r} />}

      {pendientes > 0 && (
        <Tarjeta style={{ borderColor: C.acento, borderWidth: 1.5 }}>
          <Text style={{ fontSize: 15, color: C.texto, marginBottom: 4 }}>
            Hay {pendientes} {pendientes === 1 ? 'movimiento' : 'movimientos'} de esta semana sin cortar.
          </Text>
          <Boton
            titulo="✂️ Hacer corte de esta semana"
            onPress={() => router.push(`/corte/nuevo?desde=${semana.inicio}&hasta=${semana.fin}`)}
          />
        </Tarjeta>
      )}
    </Pantalla>
  );
}
