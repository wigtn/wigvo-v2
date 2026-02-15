import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#ffffff',
        tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#2a2a3e' },
        tabBarActiveTintColor: '#4a90d9',
        tabBarInactiveTintColor: '#606080',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'WIGVO',
          tabBarLabel: '홈',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📞</Text>,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: '통화 기록',
          tabBarLabel: '기록',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarLabel: '설정',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
