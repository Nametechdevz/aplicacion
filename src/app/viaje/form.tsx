import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { Boton, C, Campo, Entrada, EntradaFecha, EntradaPesos, Linea, Pantalla, s, Tarjeta } from '../../components/ui';
import { guardarViaje, leerAjustes, obtenerViaje } from '../../lib/db';
import { hoy, parseDecimal, pesos } from '../../lib/format';

export default function FormViaje() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;

  const [fecha, setFecha] = useState(hoy());
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [cliente, setCliente] = useState('');
  const [carga, setCarga] = useState('');
  const [flete, setFlete] = useState(0);
  const [pct, setPct] = useState('');
  const [kmIni, setKmIni] = useState('');
  const [kmFin, setKmFin] = useState('');
  const [notas, setNotas] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      if (editId) {
        const v = await obtenerViaje(db, editId);
        if (v) {
          setFecha(v.fecha);
          setOrigen(v.origen);
          setDestino(v.destino);
          setCliente(v.cliente);
          setCarga(v.carga);
          setFlete(v.valor_flete);
          setPct(String(v.porcentaje));
          setKmIni(v.km_inicio != null ? String(v.km_inicio) : '');
          setKmFin(v.km_fin != null ? String(v.km_fin) : '');
          setNotas(v.notas);
          setBloqueado(!!v.corte_id);
        }
      } else {
        const a = await leerAjustes(db);
        setPct(String(a.porcentaje));
        // Sugerir el km inicial con el km final del último viaje
        const ult = await db.getFirstAsync<{ km_fin: number | null }>(
          'SELECT km_fin FROM viajes WHERE km_fin IS NOT NULL ORDER BY fecha DESC, id DESC LIMIT 1'
        );
        if (ult?.km_fin) setKmIni(String(ult.km_fin));
      }
      setListo(true);
    })();
  }, [db, editId]);

  const porcentaje = parseDecimal(pct) ?? 0;
  const comision = Math.round((flete * porcentaje) / 100);

  const guardar = async () => {
    if (!origen.trim() && !destino.trim()) return Alert.alert('Falta la ruta', 'Escribe al menos el origen o el destino.');
    if (flete <= 0) return Alert.alert('Falta el flete', 'Escribe el valor del flete.');
    if (porcentaje < 0 || porcentaje > 100) return Alert.alert('Porcentaje inválido', 'Debe estar entre 0 y 100.');
    const ki = parseDecimal(kmIni);
    const kf = parseDecimal(kmFin);
    if (ki != null && kf != null && kf < ki) return Alert.alert('Kilometraje', 'El km final no puede ser menor que el inicial.');

    const nuevoId = await guardarViaje(
      db,
      { fecha, origen, destino, cliente, carga, valor_flete: flete, porcentaje, km_inicio: ki, km_fin: kf, notas },
      editId
    );
    if (editId) router.back();
    else router.replace(`/viaje/${nuevoId}`);
  };

  if (!listo) return <Pantalla>{null}</Pantalla>;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: editId ? 'Editar viaje' : 'Nuevo viaje' }} />
      {bloqueado && (
        <Tarjeta style={{ backgroundColor: '#FEF3C7' }}>
          <Text style={{ color: C.texto }}>Este viaje ya está en un corte. Para modificarlo, primero reabre ese corte.</Text>
        </Tarjeta>
      )}
      <Campo etiqueta="Fecha de salida">
        <EntradaFecha valor={fecha} onChange={setFecha} />
      </Campo>
      <Campo etiqueta="Origen">
        <Entrada value={origen} onChangeText={setOrigen} placeholder="Ej: Bogotá" editable={!bloqueado} />
      </Campo>
      <Campo etiqueta="Destino">
        <Entrada value={destino} onChangeText={setDestino} placeholder="Ej: Barranquilla" editable={!bloqueado} />
      </Campo>
      <Campo etiqueta="Cliente / empresa">
        <Entrada value={cliente} onChangeText={setCliente} placeholder="Opcional" editable={!bloqueado} />
      </Campo>
      <Campo etiqueta="Carga">
        <Entrada value={carga} onChangeText={setCarga} placeholder="Ej: cemento, 30 ton" editable={!bloqueado} />
      </Campo>
      <Campo etiqueta="Valor del flete">
        <EntradaPesos valor={flete} onChange={setFlete} />
      </Campo>
      <Campo etiqueta="% del conductor">
        <Entrada value={pct} onChangeText={setPct} keyboardType="decimal-pad" editable={!bloqueado} />
      </Campo>
      <Tarjeta>
        <Linea etiqueta={`Conductor (${porcentaje}% del flete)`} valor={pesos(comision)} />
        <Linea etiqueta="Queda para el camión (antes de gastos)" valor={pesos(flete - comision)} color={C.verde} />
      </Tarjeta>
      <Campo etiqueta="Kilometraje (opcional)">
        <Entrada value={kmIni} onChangeText={setKmIni} keyboardType="number-pad" placeholder="Km al salir" editable={!bloqueado} />
        <Entrada
          value={kmFin}
          onChangeText={setKmFin}
          keyboardType="number-pad"
          placeholder="Km al llegar"
          editable={!bloqueado}
          style={{ marginTop: 8 }}
        />
      </Campo>
      <Campo etiqueta="Notas">
        <Entrada value={notas} onChangeText={setNotas} placeholder="Opcional" multiline style={{ minHeight: 70 }} editable={!bloqueado} />
      </Campo>
      {!bloqueado && <Boton titulo={editId ? 'Guardar cambios' : 'Guardar viaje'} onPress={guardar} />}
      <Text style={[s.ayuda, { textAlign: 'center', marginTop: 12 }]}>
        Después de guardar podrás agregarle gastos al viaje.
      </Text>
    </Pantalla>
  );
}
