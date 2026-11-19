import { Tabs } from 'expo-router';
import { color, useLayout } from '../../design';
import { HayveTabBar } from '../../features/nav/TabBar';

/**
 * Ten independent Hayve destinations. On iPhone a floating bottom bar shows
 * Home / Shop / Pay / Profile plus a centre launcher for every service; on
 * iPad and desktop web every destination is listed in a sidebar.
 */
export default function TabsLayout() {
  const { isWide } = useLayout();
  return (
    <Tabs
      tabBar={(props) => <HayveTabBar {...props} wide={isWide} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isWide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: color.bg },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="pay" options={{ title: 'Pay' }} />
      <Tabs.Screen name="ride" options={{ title: 'Ride' }} />
      <Tabs.Screen name="bites" options={{ title: 'Bites' }} />
      <Tabs.Screen name="drive" options={{ title: 'Drive' }} />
      <Tabs.Screen name="stay" options={{ title: 'Stay' }} />
      <Tabs.Screen name="send" options={{ title: 'Send' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
