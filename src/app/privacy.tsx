import { View } from 'react-native';
import { color, Header, Screen, T } from '../design';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Who we are',
    body: ['Hayve is a preview product. This policy explains which personal data the Hayve app and website process, why, and the choices you have. Contact: privacy@hayve.app.'],
  },
  {
    title: 'What we collect',
    body: [
      'Account data: name, username, email address, a hashed password (never the password itself), and two-step verification status.',
      'Profile data you choose to add: profile picture, bio (up to 200 characters), city and wishlist.',
      'Activity: listings, orders, bookings, rides, reviews, messages and payment records needed to run the service.',
      'Business verification: legal name, KVK number, VAT number, business address and the result of the owner ID check.',
      'Location, only while you use Ride, Bites or maps, and only with your permission.',
    ],
  },
  {
    title: 'Anonymous gifts',
    body: ['When someone buys an item from your wishlist, Hayve never shows you who bought it. Only the buyer, payment processing and, where legally required, support staff can link a gift to its purchaser.'],
  },
  {
    title: 'Why we use it',
    body: ['To provide the services you ask for, keep accounts secure, prevent fraud, meet legal and tax obligations (for example VAT invoices), and improve Hayve. We do not sell personal data.'],
  },
  {
    title: 'Storage and security',
    body: [
      'Data is stored in the EU on managed PostgreSQL with daily backups. Pictures are stored in object storage behind a CDN; only their links are kept in the database.',
      'Uploads are checked for file type and size. Secrets and API keys are kept in environment variables, never in code. Admin accounts require email verification and two-step verification, and every admin action is logged.',
    ],
  },
  {
    title: 'Maps',
    body: ['Maps, address search and directions are provided by Mapbox. When you use a map, your approximate position and searches are sent to Mapbox to show results.'],
  },
  {
    title: 'Your rights',
    body: [
      'Download your data at any time from Settings → Download my data.',
      'Delete your account from Settings → Delete account. Records we must keep by law (completed payments, invoices) are kept anonymised.',
      'You can also ask us to correct or restrict your data, or object to processing, and you can complain to your local data protection authority (for example the ICO in the UK, the Data Protection Commission in Ireland, or your state attorney general in the US). Residents of California and other US states have the rights given by their state privacy laws (such as the CCPA).',
    ],
  },
  {
    title: 'Retention',
    body: ['We keep account data while your account is open. Financial records are kept for as long as the law in your country requires (usually 5 to 7 years). Backups roll over within 30 days.'],
  },
];

export default function Privacy() {
  return (
    <Screen header={<Header back title="Privacy policy" fallback="/settings" />} maxWidth={720}>
      <T variant="footnote" color={color.textSecondary} style={{ marginTop: 8 }}>
        Last updated 19 November 2026
      </T>
      <View style={{ gap: 24, marginTop: 16, marginBottom: 32 }}>
        {SECTIONS.map((s) => (
          <View key={s.title} style={{ gap: 8 }}>
            <T variant="title3">{s.title}</T>
            {s.body.map((b) => (
              <T key={b} color={color.textSecondary} style={{ lineHeight: 24 }}>
                {b}
              </T>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}
