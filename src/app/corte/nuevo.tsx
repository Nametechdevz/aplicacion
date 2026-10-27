import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { ItemGasto, ItemViaje, TarjetasResumen } from '../../components/items';
import { Boton, C, Campo, Entrada, EntradaFecha, Pantalla, s, Tarjeta, Titulo } from '../../components/ui';
import { calcularResumen, cerrarCorte, pendientesCorte, type Gasto, type Viaje } from '../../lib/db';
import { hoy, semanaDe } from '../../lib/format';

export default function NuevoCorte() {
  const db = useSQLiteContext();
  const p = useLocalSearchParams<{ desde?: string; hasta?: string }>();
  const semana = semanaDe(hoy());
  const [desde, setDesde] = useState(p.desde ?? semana.inicio);
  const [hasta, setHasta] = useState(p.hasta ?? semana.fin);
  const [notas, setNotas] = useState('');
  const [datos, setDatos] = useState<{ viajes: Viaje[]; gastos: Gasto[] }>({ viajes: [], gastos: [] });
  const [antiguos, setAntiguos] = useState(0);

  useEffect(() => {
    if (desde > hasta) return;
    pendientesCorte(db, desde, hasta).then(setDatos);
    db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM viajes WHERE corte_id IS NULL AND fecha < ?)
            + (SELECT COUNT(*) FROM gastos WHERE corte_id IS NULL AND viaje_id IS NULL AND fecha < ?) AS n`,
      desde,
      desde
    ).then((r) => setAntiguos(r?.n ?? 0));
  }, [db, desde, hasta]);

  const r = calcularResumen(datos.viajes, datos.gastos);
  const vacio = datos.viajes.length === 0 && datos.gastos.length === 0;

  const confirmar = () => {
    if (desde > hasta) return Alert.alert('Fechas', 'La fecha inicial no puede ser después de la final.');
    Alert.alert(
      'Cerrar corte',
      `Se cerrarán ${datos.viajes.length} viajes y ${datos.gastos.length} gastos. Quedarán bloqueados hasta que reabras el corte.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar corte',
          onPress: async () => {
            const id = await cerrarCorte(db, desde, hasta, notas);
            router.replace(`/corte/${id}`);
          },
        },
      ]
    );
  };

  return (
    <Pantalla>
      <Tarjeta>
        <Campo etiqueta="Desde">
          <EntradaFecha valor={desde} onChange={setDesde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <EntradaFecha valor={hasta} onChange={setHasta} />
        </Campo>
        <Text style={s.ayuda}>Solo entran viajes y gastos que no estén en otro corte.</Text>
      </Tarjeta>

      {antiguos > 0 && (
        <Tarjeta style={{ backgroundColor: '#FEF3C7' }}>
          <Text style={{ color: C.texto }}>
            Hay {antiguos} movimientos sin cortar antes de esta fecha. Si quieres incluirlos, mueve la fecha "Desde" hacia atrás.
          </Text>
        </Tarjeta>
      )}

      {vacio ? (
        <Text style={[s.ayuda, { textAlign: 'center', marginVertical: 24, fontSize: 15 }]}>
          No hay movimientos pendientes en este rango.
        </Text>
      ) : (
        <>
          <TarjetasResumen r={r} />
          {datos.viajes.length > 0 && <Titulo>Viajes ({datos.viajes.length})</Titulo>}
          {datos.viajes.map((v) => (
            <ItemViaje key={v.id} v={v} />
          ))}
          {datos.gastos.length > 0 && <Titulo>Gastos ({datos.gastos.length})</Titulo>}
          {datos.gastos.map((g) => (
            <ItemGasto key={g.id} g={g} />
          ))}
          <Campo etiqueta="Notas del corte">
            <Entrada value={notas} onChangeText={setNotas} placeholder="Opcional" multiline style={{ minHeight: 60 }} />
          </Campo>
          <Boton titulo="✂️ Cerrar corte" onPress={confirmar} />
        </>
      )}
    </Pantalla>
  );
}
