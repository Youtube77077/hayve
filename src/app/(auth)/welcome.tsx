import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { media } from '../../backend/media';
import { Button, color, HayveLogo, Icon, layout, Photo, PRODUCTS, radius, service, T, useLayout } from '../../design';
import { ProductWordmark } from '../../features/nav/Wordmarks';
import { useT } from '../../lib/i18n';

/**
 * Onboarding on iPhone/iPad and the public landing page on the website.
 */
export default function Welcome() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { isWide, gutter, isDesktop } = useLayout();
  const headline = isDesktop ? 60 : isWide ? 48 : 38;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.white }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View style={{ width: '100%', maxWidth: layout.maxContent, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: insets.top + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 56 }}>
          <HayveLogo height={30} />
          <View style={{ flex: 1 }} />
          {isWide && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={t('Sign in')} variant="ghost" onPress={() => router.push('/sign-in')} />
              <Button title={t('Get started')} onPress={() => router.push('/start')} />
            </View>
          )}
        </View>

        <View style={{ flexDirection: isWide ? 'row' : 'column', gap: isWide ? 48 : 24, alignItems: isWide ? 'center' : 'stretch', marginTop: isWide ? 48 : 24 }}>
          <View style={{ flex: 1, maxWidth: 560 }}>
            <T variant="subhead" weight="700" color={color.black} style={{ marginBottom: 16 }}>
              {t('In the US, Canada, the UK, Ireland and across Europe')}
            </T>
            <T weight="800" style={{ fontSize: headline, lineHeight: headline * 1.08, letterSpacing: -1.4 }}>
              {t('One account for everything you need.')}
            </T>
            <T variant="body" color={color.textSecondary} style={{ marginTop: 16, maxWidth: 480, lineHeight: 24 }}>
              {t('Shop and sell, pay friends, get a ride, order dinner, rent a car and book a stay. One login, one wallet.')}
            </T>
            <View style={{ gap: 8, marginTop: 32, flexDirection: isWide ? 'row' : 'column' }}>
              <Button title={t('Get started')} size="lg" full={!isWide} onPress={() => router.push('/start')} />
              <Button title={t('I already have an account')} variant="ghost" size="lg" full={!isWide} onPress={() => router.push('/sign-in')} />
            </View>
          </View>
          <View style={{ flex: isWide ? 1 : undefined }}>
            <Photo uri={media.city.newYork} style={{ width: '100%', aspectRatio: isWide ? 1.1 : 1.5 }} rounded={radius.lg} icon="location-outline" />
          </View>
        </View>

        <T variant="title2" style={{ marginTop: isWide ? 80 : 48, marginBottom: 16 }}>
          {t('Everything in Hayve')}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, rowGap: 16 }}>
          {PRODUCTS.map((key) => (
            <View key={key} style={{ width: isDesktop ? '33.33%' : isWide ? '50%' : '100%', paddingHorizontal: 8 }}>
              <ProductCard product={key} />
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push('/start')} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 32, borderRadius: radius.lg, padding: 24, backgroundColor: color.black, flexDirection: isWide ? 'row' : 'column', gap: 16, alignItems: isWide ? 'center' : 'flex-start', opacity: pressed ? 0.92 : 1 })}>
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="title3" color={color.white}>Hayve for Business</T>
            <T color={color.grey200}>Open a verified Hayve Store, drive, deliver, host or accept Hayve Pay.</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T variant="headline" color={color.white}>Get started</T>
            <Icon name="arrow-forward" size={18} color={color.white} />
          </View>
        </Pressable>

        <View style={{ marginTop: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="information-circle" size={18} color={color.grey500} />
          <T variant="footnote" color={color.textSecondary} style={{ flex: 1 }}>
            Preview build. Payments, rides, rentals, stays and deliveries are simulated and marked Demo. No real money or services are involved.{' '}
            <T variant="footnote" color={color.black} weight="700" onPress={() => router.push('/privacy')} accessibilityRole="link">
              Privacy policy
            </T>
          </T>
        </View>
      </View>
    </ScrollView>
  );
}

function ProductCard({ product }: { product: (typeof PRODUCTS)[number] }) {
  const s = service(product);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable onPress={() => router.push('/start')} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} accessibilityRole="button" accessibilityLabel={s.name} style={{ borderWidth: 1, borderColor: hovered ? color.black : color.line, borderRadius: radius.lg, padding: 20, gap: 16, minHeight: 128, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          <ProductWordmark product={product as never} hovered={hovered} size={20} />
        </View>
        <Icon name={s.icon} size={22} />
      </View>
      <T color={color.textSecondary}>{s.tagline}</T>
    </Pressable>
  );
}
