import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { migrar } from '../lib/db';
import { C } from '../components/ui';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="micamion.db" onInit={migrar}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.primario },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: C.fondo },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="viaje/form" options={{ title: 'Viaje', presentation: 'modal' }} />
        <Stack.Screen name="viaje/[id]" options={{ title: 'Detalle del viaje' }} />
        <Stack.Screen name="gasto/form" options={{ title: 'Gasto', presentation: 'modal' }} />
        <Stack.Screen name="corte/nuevo" options={{ title: 'Nuevo corte' }} />
        <Stack.Screen name="corte/[id]" options={{ title: 'Corte' }} />
      </Stack>
    </SQLiteProvider>
  );
}
