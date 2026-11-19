import { Icon } from '../../design/icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, color, Header, Screen, Section, T, useToast } from '../../design';

const FAQ = [
  ['How does anonymous wishlist gifting work?', "When someone gifts an item from your public wishlist, Hayve delivers it to your saved address. You'll only see the item marked as Sold. The buyer's identity is never shown to you, not in notifications, orders or messages."],
  ['Is the money in Hayve Pay real?', 'Not in this preview build. All balances, cards, top-ups and payouts are simulated. Licensed payment partners will power real money at launch.'],
  ['How do I get paid as a seller?', 'Earnings are held as pending until the buyer confirms delivery, then released to your Hayve Pay balance. Withdraw to your bank any time.'],
  ['Can I use one account for selling, hosting and driving?', 'Yes. One Hayve account can hold several business roles. Add them from Hayve for Business.'],
  ['How do I cancel a booking?', 'Open the booking from Orders & bookings and tap Cancel. Reserved payments are released immediately, and captured payments are refunded to Hayve Pay.'],
];

export default function Help() {
  const [open, setOpen] = useState<number | null>(0);
  const toast = useToast();
  return (
    <Screen header={<Header back title="Help & support" fallback="/profile" />} maxWidth={720}>
      <Section title="Frequently asked" style={{ marginTop: 4 }}>
        <View style={{ gap: 8 }}>
          {FAQ.map(([q, a], i) => (
            <Card key={q} onPress={() => setOpen(open === i ? null : i)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T variant="headline" style={{ flex: 1 }}>
                  {q}
                </T>
                <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={color.textTertiary} />
              </View>
              {open === i && (
                <T color={color.textSecondary} style={{ marginTop: 8 }}>
                  {a}
                </T>
              )}
            </Card>
          ))}
        </View>
      </Section>
      <Section title="Contact us">
        <Card tone="soft" style={{ gap: 10 }}>
          <T>Our support team typically replies within a few hours.</T>
          <Pressable>
            <Button title="Start a support chat" icon="chatbubbles-outline" onPress={() => toast('Support chat is simulated in this build. A human team arrives at launch.', 'info')} />
          </Pressable>
        </Card>
      </Section>
    </Screen>
  );
}
