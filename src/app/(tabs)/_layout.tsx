import { Tabs } from 'expo-router';
import { color, useLayout } from '../../design';
import { HayveTabBar } from '../../features/nav/TabBar';

/**
 * Hayve destinations: Home plus the six products (Shop, Pay, Ride, Bites,
 * Drive, Stay), Search and Profile. Desktop and iPad get a sidebar with the
 * illustrated product wordmarks; phones get a bottom bar with a More sheet.
 * Hayve Send is not a destination: it lives inside the Shop order flow.
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
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
