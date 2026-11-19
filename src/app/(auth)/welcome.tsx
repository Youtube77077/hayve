import { Icon } from '../../design/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { media } from '../../backend/media';
import { Button, color, HayveLogo, layout, Photo, radius, SERVICES, ServiceTile, T, useLayout } from '../../design';

/**
 * Onboarding on iPhone/iPad and the public landing page on the website.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { isWide, gutter, isDesktop } = useLayout();
  const products = SERVICES.filter((s) => !['home', 'explore', 'profile'].includes(s.key));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.ink }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={{ minHeight: isWide ? 640 : 560 }}>
        <Photo uri={media.city.amsterdam} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} plain />
        <LinearGradient colors={['rgba(17,13,46,0.35)', 'rgba(17,13,46,0.75)', color.ink]} locations={[0, 0.55, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter + 4, paddingTop: insets.top + 16, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <HayveLogo height={32} tone="light" />
            <View style={{ flex: 1 }} />
            {isWide && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Sign in" variant="glass" onPress={() => router.push('/sign-in')} />
                <Button title="Create account" variant="accent" onPress={() => router.push('/sign-up')} />
              </View>
            )}
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 36, maxWidth: 680 }}>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(200,245,66,0.16)', paddingHorizontal: 12, height: 30, borderRadius: radius.pill, marginBottom: 18 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.lime }} />
              <T variant="caption" color={color.lime} weight="700">
                Now in Amsterdam
              </T>
            </View>
            <T style={{ fontSize: isDesktop ? 64 : isWide ? 52 : 40, lineHeight: isDesktop ? 68 : isWide ? 56 : 44, fontWeight: '800', letterSpacing: -1.6, color: '#fff' }}>
              One account.{'\n'}One wallet.{'\n'}
              <T style={{ fontSize: isDesktop ? 64 : isWide ? 52 : 40, lineHeight: isDesktop ? 68 : isWide ? 56 : 44, fontWeight: '800', letterSpacing: -1.6, color: color.lime }}>Everything connected.</T>
            </T>
            <T variant="body" color={color.textOnDarkSecondary} style={{ marginTop: 16, maxWidth: 520 }}>
              Shop and sell, pay friends, get a ride, order dinner, rent a car, book a stay and send a parcel — all in Hayve.
            </T>
            {!isWide && (
              <View style={{ gap: 10, marginTop: 28 }}>
                <Button title="Create your Hayve account" variant="accent" size="lg" full onPress={() => router.push('/sign-up')} />
                <Button title="Sign in" variant="glass" size="lg" full onPress={() => router.push('/sign-in')} />
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter + 4, gap: 14 }}>
        <T variant="overline" color={color.textOnDarkSecondary}>
          The Hayve ecosystem
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 }}>
          {products.map((s) => (
            <View key={s.key} style={{ width: isDesktop ? '25%' : isWide ? '33.33%' : '50%', paddingHorizontal: 6 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minHeight: 132 }}>
                <ServiceTile icon={s.iconActive} accent={color.lime} size={42} />
                <View>
                  <T variant="headline" color="#fff">
                    {s.name}
                  </T>
                  <T variant="footnote" color={color.textOnDarkSecondary}>
                    {s.tagline}
                  </T>
                </View>
              </View>
            </View>
          ))}
          <View style={{ width: isDesktop ? '25%' : isWide ? '33.33%' : '50%', paddingHorizontal: 6 }}>
            <Pressable onPress={() => router.push('/sign-up')} style={{ backgroundColor: color.lime, borderRadius: radius.lg, padding: 16, gap: 12, minHeight: 132, justifyContent: 'space-between' }}>
              <Icon name="briefcase" size={24} color={color.ink} />
              <View>
                <T variant="headline">Hayve for Business</T>
                <T variant="footnote" color={color.limeInk}>
                  Sell, host, drive, deliver or accept Hayve Pay →
                </T>
              </View>
            </Pressable>
          </View>
        </View>
        <View style={{ marginTop: 18, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon name="flask-outline" size={20} color={color.lime} />
          <T variant="footnote" color={color.textOnDarkSecondary} style={{ flex: 1 }}>
            Preview build. Payments, rides, rentals, stays and deliveries are simulated. No real money or services are involved.
          </T>
        </View>
      </View>
    </ScrollView>
  );
}
