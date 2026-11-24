import { Icon, type IconName } from '../design/icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { shop } from '../backend/api';
import { media } from '../backend/media';
import type { ProductCategory, ProductCondition } from '../backend/types';
import { Button, color, Header, Input, parseEuro, Photo, radius, Screen, Select, Sheet, Stepper, T, useToast } from '../design';
import { SimNote } from '../features/common';
import { money } from '../lib/format';
import { useAction } from '../lib/hooks';
import { usePersonalisation } from '../features/onboarding/store';
import { celebrate } from '../features/celebrate';

const SAMPLE_PHOTOS = Object.values(media.products);

/** Create or edit a Hayve Shop listing (`/sell` or `/sell?id=…`). */
export default function Sell() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const toast = useToast();
  const { run, busy } = useAction();
  const [images, setImages] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Onboarding: "What will you sell first?" starts the form with that category.
  const prefs = usePersonalisation();
  const [category, setCategory] = useState<ProductCategory | null>(prefs.goal === 'sell' ? (prefs.shopFor?.[0] ?? null) : null);
  const [condition, setCondition] = useState<ProductCondition | null>(null);
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [samples, setSamples] = useState(false);

  useEffect(() => {
    if (!id) return;
    try {
      const l = shop.getListingForEdit(id);
      setImages(l.images);
      setTitle(l.title);
      setDescription(l.description);
      setCategory(l.category);
      setCondition(l.condition);
      setBrand(l.brand ?? '');
      setSize(l.size ?? '');
      setPrice((l.priceCents / 100).toFixed(2));
      setQuantity(l.quantity ?? 1);
    } catch (e) {
      toast((e as Error).message, 'error');
      router.back();
    }
  }, [id, toast]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast('Allow photo access in Settings to add photos', 'error');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8 - images.length, quality: 0.6 });
    if (!res.canceled) setImages((cur) => [...cur, ...res.assets.map((a) => a.uri)].slice(0, 8));
  };

  const camera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast('Allow camera access in Settings to take photos', 'error');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) setImages((cur) => [...cur, res.assets[0].uri].slice(0, 8));
  };

  const priceCents = parseEuro(price);
  const submit = () => {
    const input = {
      title,
      description,
      priceCents: priceCents ?? 0,
      category: category ?? 'general',
      condition: condition ?? 'good',
      brand,
      size,
      images,
      quantity,
    };
    if (!category) return toast('Choose a category', 'error');
    if (!condition) return toast('Choose the condition', 'error');
    return run(() => (id ? (shop.updateListing(id, input), id) : shop.createListing(input)), {
      success: id ? 'Listing updated' : undefined,
      onDone: (pid) => {
        if (!id) celebrate({ title: 'Your item is live!', body: 'People can find and buy it on Hayve Shop now.' });
        router.replace(`/product/${pid}`);
      },
    });
  };

  return (
    <Screen header={<Header back title={id ? 'Edit listing' : 'Sell an item'} fallback="/shop" />} maxWidth={720} keyboard footer={<Button title={busy ? (id ? 'Saving…' : 'Putting it live…') : id ? 'Save changes' : 'Put it live'} size="lg" full loading={busy} onPress={submit} />}>
      <T variant="headline" style={{ marginTop: 4, marginBottom: 10 }}>
        Photos <T variant="footnote" color={color.textTertiary}>({images.length}/8)</T>
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {images.map((uri, i) => (
          <View key={`${uri}${i}`}>
            <Photo uri={uri} style={{ width: 110, height: 140 }} rounded={radius.md} />
            {i === 0 && (
              <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: color.ink, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <T variant="caption" color="#fff">
                  Cover
                </T>
              </View>
            )}
            <Pressable onPress={() => setImages((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel="Remove photo" style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(17,13,46,0.7)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ))}
        {images.length < 8 && (
          <>
            <AddTile icon="images-outline" label="Library" onPress={pick} />
            <AddTile icon="camera-outline" label="Camera" onPress={camera} />
            <AddTile icon="sparkles-outline" label="Sample" onPress={() => setSamples(true)} />
          </>
        )}
      </ScrollView>

      <View style={{ gap: 14, marginTop: 22 }}>
        <Input label="Title" placeholder="e.g. Vintage denim jacket" value={title} onChangeText={setTitle} maxLength={80} />
        <Input label="Describe your item" placeholder="Condition, size, why you're selling…" value={description} onChangeText={setDescription} multiline maxLength={1000} />
        <Select label="Category" value={category} onChange={setCategory} options={(Object.keys(shop.CATEGORY_LABEL) as ProductCategory[]).map((k) => ({ key: k, label: shop.CATEGORY_LABEL[k] }))} />
        <Select label="Condition" value={condition} onChange={setCondition} options={(Object.keys(shop.CONDITION_LABEL) as ProductCondition[]).map((k) => ({ key: k, label: shop.CONDITION_LABEL[k] }))} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Input containerStyle={{ flex: 1 }} label="Brand (optional)" value={brand} onChangeText={setBrand} />
          <Input containerStyle={{ flex: 1 }} label="Size (optional)" value={size} onChangeText={setSize} />
        </View>
        <Input label="Price" icon="pricetag-outline" placeholder="0.00" keyboardType="decimal-pad" value={price} onChangeText={setPrice} hint={priceCents ? `Buyers pay ${money(priceCents + shop.feeFor(priceCents))} incl. fees. You receive ${money(priceCents)}.` : 'You keep the full item price.'} />
        <View style={{ backgroundColor: color.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: color.line }}>
          <Stepper label="Quantity" sub="For identical items you can sell more than once" value={quantity} min={1} max={99} onChange={setQuantity} />
        </View>
        <SimNote text="Earnings are paid into your Hayve Pay balance once the buyer confirms delivery (simulated)." />
      </View>

      <Sheet visible={samples} onClose={() => setSamples(false)} title="Sample photos">
        <T variant="footnote" color={color.textSecondary} style={{ marginBottom: 12 }}>
          Handy for trying Hayve without your own photos.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SAMPLE_PHOTOS.map((uri) => (
            <Pressable
              key={uri}
              onPress={() => {
                setImages((cur) => [...cur, uri].slice(0, 8));
                setSamples(false);
              }}
            >
              <Photo uri={uri} style={{ width: 96, height: 96 }} rounded={radius.sm} />
            </Pressable>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

function AddTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 110, height: 140, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pressed ? color.black : color.grey500, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center', gap: 6 })}>
      <Icon name={icon} size={26} color={color.black} />
      <T variant="subhead" weight="700" color={color.black}>
        {label}
      </T>
    </Pressable>
  );
}
