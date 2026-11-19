import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { social } from '../../backend/api';
import { media } from '../../backend/media';
import { Avatar, Button, color, Header, Input, Screen, Segmented, Sheet, T, useToast } from '../../design';
import { useAction, useLive } from '../../lib/hooks';

export default function EditProfile() {
  const me = useLive(() => social.myProfile()).data;
  const toast = useToast();
  const { run, busy } = useAction();
  const [displayName, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>();
  const [accountType, setType] = useState<'individual' | 'business'>('individual');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.profile.displayName);
    setUsername(me.profile.username);
    setBio(me.profile.bio);
    setCity(me.profile.city);
    setAvatar(me.profile.avatar);
    setType(me.profile.accountType);
  }, [me?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async () => {
    setPicker(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('Allow photo access to change your picture', 'error');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!res.canceled) setAvatar(res.assets[0].uri);
  };

  return (
    <Screen header={<Header back title="Edit profile" fallback="/profile" />} maxWidth={560} keyboard footer={<Button title="Save" size="lg" full loading={busy} onPress={() => run(() => social.updateProfile({ displayName, username, bio, city, avatar, accountType }), { success: 'Profile saved', onDone: () => router.back() })} />}>
      <View style={{ alignItems: 'center', gap: 10, marginVertical: 12 }}>
        <Pressable onPress={() => setPicker(true)} accessibilityLabel="Change profile picture">
          <Avatar uri={avatar} name={displayName} size={104} ring />
        </Pressable>
        <Button title="Change photo" variant="ghost" size="sm" onPress={() => setPicker(true)} />
      </View>
      <View style={{ gap: 14 }}>
        <Segmented value={accountType} onChange={setType} options={[{ key: 'individual', label: 'Personal' }, { key: 'business', label: 'Business' }]} />
        <Input label="Display name" value={displayName} onChangeText={setName} />
        <Input label="Username" icon="at-outline" autoCapitalize="none" value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))} hint={`hayve.app/u/${username}`} />
        <Input label="Bio" multiline maxLength={240} value={bio} onChangeText={setBio} hint={`${bio.length}/240`} />
        <Input label="City" icon="location-outline" value={city} onChangeText={setCity} />
      </View>
      <Sheet visible={picker} onClose={() => setPicker(false)} title="Profile picture">
        <View style={{ gap: 10 }}>
          <Button title="Choose from library" icon="images-outline" full onPress={pick} />
          <T variant="footnote" color={color.textSecondary} style={{ marginTop: 8 }}>
            Or pick a sample:
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {Object.values(media.avatars).map((uri) => (
              <Pressable key={uri} onPress={() => { setAvatar(uri); setPicker(false); }}>
                <Avatar uri={uri} size={56} />
              </Pressable>
            ))}
          </View>
          {avatar && <Button title="Remove photo" variant="danger" full onPress={() => { setAvatar(undefined); setPicker(false); }} />}
        </View>
      </Sheet>
    </Screen>
  );
}
