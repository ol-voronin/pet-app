import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { NewPlaceScreen } from '@/features/places/components/NewPlaceScreen';
import { useUserLocation } from '@/features/places/location';
import { DEFAULT_CENTER } from '@/features/places/logic';

/** Adds the person's own marker. `lat`/`lon` — where the map starts (a long press or the map centre). */
export default function NewPlaceRoute() {
  const params = useLocalSearchParams<{ lat?: string; lon?: string }>();
  const userPoint = useUserLocation((s) => s.point);
  const [start] = useState(() => {
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    return params.lat && params.lon && Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon }
      : (userPoint ?? DEFAULT_CENTER);
  });
  return <NewPlaceScreen start={start} />;
}
