import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';
import { C } from '../../components/ui';

const icono = (e: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{e}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.primario },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: C.primario,
        tabBarInactiveTintColor: C.suave,
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Semana', tabBarIcon: icono('📊') }} />
      <Tabs.Screen name="viajes" options={{ title: 'Viajes', tabBarIcon: icono('🚚') }} />
      <Tabs.Screen name="gastos" options={{ title: 'Gastos', tabBarIcon: icono('🧾') }} />
      <Tabs.Screen name="cortes" options={{ title: 'Cortes', tabBarIcon: icono('✂️') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icono('⚙️') }} />
    </Tabs>
  );
}
