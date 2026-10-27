import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Boton, C, Campo, Chip, Entrada, EntradaFecha, EntradaPesos, Pantalla, s, Tarjeta } from '../../components/ui';
import { CATEGORIAS, categoria, type CategoriaId } from '../../lib/categorias';
import { eliminarGasto, guardarGasto, obtenerGasto, type PagadoPor, type Viaje } from '../../lib/db';
import { fechaCorta, hoy, parseDecimal, pesos } from '../../lib/format';

export default function FormGasto() {
  const db = useSQLiteContext();
  const p = useLocalSearchParams<{ id?: string; viajeId?: string; fecha?: string }>();
  const editId = p.id ? Number(p.id) : undefined;

  const [fecha, setFecha] = useState(p.fecha ?? hoy());
  const [cat, setCat] = useState<CategoriaId>('acpm');
  const [valor, setValor] = useState(0);
  const [galones, setGalones] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pagadoPor, setPagadoPor] = useState<PagadoPor>('dueno');
  const [viajeId, setViajeId] = useState<number | null>(p.viajeId ? Number(p.viajeId) : null);
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [bloqueado, setBloqueado] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      let actual: number | null = viajeId;
      if (editId) {
        const g = await obtenerGasto(db, editId);
        if (g) {
          setFecha(g.fecha);
          setCat(g.categoria as CategoriaId);
          setValor(g.valor);
          setGalones(g.galones != null ? String(g.galones) : '');
          setDescripcion(g.descripcion);
          setPagadoPor(g.pagado_por);
          setViajeId(g.viaje_id);
          setBloqueado(!!g.corte_id);
          actual = g.viaje_id;
        }
      }
      // Viajes recientes sin cortar + el viaje actual (si lo hay)
      setViajes(
        await db.getAllAsync<Viaje>(
          'SELECT * FROM viajes WHERE corte_id IS NULL OR id = ? ORDER BY fecha DESC, id DESC LIMIT 15',
          actual ?? -1
        )
      );
      setListo(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, editId]);

  const c = categoria(cat);
  const gal = parseDecimal(galones);

  const guardar = async () => {
    if (valor <= 0) return Alert.alert('Falta el valor', 'Escribe cuánto costó.');
    await guardarGasto(
      db,
      {
        fecha,
        categoria: cat,
        descripcion,
        valor,
        galones: cat === 'acpm' ? gal : null,
        pagado_por: c.esEntrega ? 'dueno' : pagadoPor,
        viaje_id: viajeId,
      },
      editId
    );
    router.back();
  };

  const borrar = () =>
    Alert.alert('¿Borrar este gasto?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarGasto(db, editId!);
          router.back();
        },
      },
    ]);

  if (!listo) return <Pantalla>{null}</Pantalla>;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: editId ? 'Editar gasto' : 'Nuevo gasto' }} />
      {bloqueado && (
        <Tarjeta style={{ backgroundColor: '#FEF3C7' }}>
          <Text style={{ color: C.texto }}>Este gasto ya está en un corte. Para modificarlo, primero reabre ese corte.</Text>
        </Tarjeta>
      )}

      <Campo etiqueta="Tipo de gasto">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {CATEGORIAS.map((x) => (
            <Chip key={x.id} texto={`${x.icono} ${x.nombre}`} activo={cat === x.id} onPress={() => !bloqueado && setCat(x.id)} />
          ))}
        </View>
        {c.esEntrega && (
          <Text style={s.ayuda}>
            No cuenta como gasto del camión: se descuenta de lo que se le paga al conductor en el corte (anticipos, plata para el viaje).
          </Text>
        )}
      </Campo>

      <Campo etiqueta="Valor">
        <EntradaPesos valor={valor} onChange={setValor} />
      </Campo>

      {cat === 'acpm' && (
        <Campo etiqueta="Galones (opcional)">
          <Entrada value={galones} onChangeText={setGalones} keyboardType="decimal-pad" placeholder="Ej: 45" editable={!bloqueado} />
          {gal && valor ? <Text style={[s.ayuda, { marginTop: 4 }]}>{pesos(valor / gal)} por galón</Text> : null}
        </Campo>
      )}

      <Campo etiqueta="Fecha">
        <EntradaFecha valor={fecha} onChange={setFecha} />
      </Campo>

      <Campo etiqueta="Descripción">
        <Entrada
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder={cat === 'peaje' ? 'Ej: Peaje Siberia' : 'Opcional'}
          editable={!bloqueado}
        />
      </Campo>

      {!c.esEntrega && (
        <Campo etiqueta="¿Quién lo pagó?">
          <View style={{ flexDirection: 'row' }}>
            <Chip texto="El dueño" activo={pagadoPor === 'dueno'} onPress={() => !bloqueado && setPagadoPor('dueno')} />
            <Chip texto="El conductor" activo={pagadoPor === 'conductor'} onPress={() => !bloqueado && setPagadoPor('conductor')} />
          </View>
          <Text style={s.ayuda}>
            Si lo pagó el conductor (con su plata o con la que se le entregó), se le reconoce en el arreglo.
          </Text>
        </Campo>
      )}

      <Campo etiqueta="Viaje (opcional)">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip texto="Sin viaje / gasto general" activo={viajeId == null} onPress={() => !bloqueado && setViajeId(null)} />
          {viajes.map((v) => (
            <Chip
              key={v.id}
              texto={`${fechaCorta(v.fecha)} ${v.destino || v.origen}`}
              activo={viajeId === v.id}
              onPress={() => !bloqueado && setViajeId(v.id)}
            />
          ))}
        </View>
      </Campo>

      {!bloqueado && <Boton titulo={editId ? 'Guardar cambios' : 'Guardar gasto'} onPress={guardar} />}
      {editId && !bloqueado && <Boton titulo="Borrar gasto" variante="peligro" onPress={borrar} />}
    </Pantalla>
  );
}
