import { router } from 'expo-router';
import { EmptyState, Header, Screen } from '../design';

export default function NotFound() {
  return (
    <Screen header={<Header back fallback="/" />}>
      <EmptyState icon="compass-outline" title="Page not found" body="This page doesn't exist or has moved." action="Go home" onAction={() => router.replace('/')} />
    </Screen>
  );
}
