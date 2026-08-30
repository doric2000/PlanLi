import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';

const PAGE_SIZE = 60;

export function mediaLibraryAssetDescriptor(asset) {
  if (!asset?.id || !asset?.uri) return null;
  return {
    id: `asset:${asset.id}`,
    sourceId: `asset:${asset.id}`,
    assetId: asset.id,
    uri: asset.uri,
    previewUri: asset.uri,
    width: Number(asset.width) || undefined,
    height: Number(asset.height) || undefined,
    filename: asset.filename || '',
    persistence: 'selected',
  };
}

export function imagePickerAssetDescriptor(asset) {
  if (!asset?.uri) return null;
  return {
    id: asset.assetId ? `asset:${asset.assetId}` : `picker:${asset.uri}`,
    sourceId: asset.assetId ? `asset:${asset.assetId}` : `picker:${asset.uri}`,
    ...(asset.assetId ? { assetId: asset.assetId } : {}),
    uri: asset.uri,
    sourceUri: asset.uri,
    previewUri: asset.uri,
    width: Number(asset.width) || undefined,
    height: Number(asset.height) || undefined,
    filename: asset.fileName || '',
    persistence: 'ready',
  };
}

export default function useTravelMediaSource({ maxItems = 5, inlineLibraryEnabled = false } = {}) {
  // Native system pickers own thumbnail decoding on both mobile platforms. The
  // inline iOS library remains available only for controlled follow-up testing.
  const isInlineLibrary = Platform.OS === 'ios' && inlineLibraryEnabled;
  const [permission, setPermission] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [assets, setAssets] = useState([]);
  const [endCursor, setEndCursor] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestGenerationRef = useRef(0);
  const loadingRef = useRef(false);

  const readPage = useCallback(async ({ album = null, after = null, replace = false, generation } = {}) => {
    if (!isInlineLibrary) return [];
    const requestGeneration = generation ?? requestGenerationRef.current;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        ...(after ? { after } : {}),
        ...(album ? { album } : {}),
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const nextAssets = (page.assets || []).map(mediaLibraryAssetDescriptor).filter(Boolean);
      if (requestGeneration !== requestGenerationRef.current) return [];
      setAssets((current) => replace ? nextAssets : [...current, ...nextAssets]);
      setEndCursor(page.endCursor || null);
      setHasNextPage(Boolean(page.hasNextPage));
      return nextAssets;
    } catch (nextError) {
      if (requestGeneration === requestGenerationRef.current) {
        setError('לא הצלחנו לטעון את הגלריה. אפשר לנסות שוב.');
      }
      throw nextError;
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [isInlineLibrary]);

  const loadInitial = useCallback(async () => {
    if (!isInlineLibrary) return [];
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    setSelectedAlbum(null);
    setAssets([]);
    setEndCursor(null);
    setHasNextPage(false);
    try {
      const nextPermission = await MediaLibrary.requestPermissionsAsync(false, [MediaLibrary.MediaType.photo]);
      if (generation !== requestGenerationRef.current) return [];
      setPermission(nextPermission);
      if (!nextPermission.granted) {
        setError('כדי לבחור תמונות, יש לאפשר ל־PlanLi גישה לתמונות.');
        return [];
      }
      const nextAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      if (generation !== requestGenerationRef.current) return [];
      setAlbums(nextAlbums || []);
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const nextAssets = (page.assets || []).map(mediaLibraryAssetDescriptor).filter(Boolean);
      if (generation !== requestGenerationRef.current) return [];
      setAssets(nextAssets);
      setEndCursor(page.endCursor || null);
      setHasNextPage(Boolean(page.hasNextPage));
      return nextAssets;
    } catch (nextError) {
      if (generation === requestGenerationRef.current) {
        setError('לא הצלחנו לטעון את הגלריה. אפשר לנסות שוב.');
      }
      throw nextError;
    } finally {
      if (generation === requestGenerationRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [isInlineLibrary]);

  const chooseAlbum = useCallback(async (album) => {
    const nextAlbum = album || null;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setSelectedAlbum(nextAlbum);
    setAssets([]);
    setEndCursor(null);
    setHasNextPage(false);
    return readPage({ album: nextAlbum, after: null, replace: true, generation });
  }, [readPage]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || loadingRef.current) return Promise.resolve([]);
    return readPage({
      album: selectedAlbum,
      after: endCursor,
      generation: requestGenerationRef.current,
    });
  }, [endCursor, hasNextPage, readPage, selectedAlbum]);

  const pickMore = useCallback(async (remaining = maxItems) => {
    const limit = Math.max(1, Math.min(Number(remaining) || 1, maxItems));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: limit,
      orderedSelection: true,
      quality: 1,
    });
    return result.canceled
      ? []
      : (result.assets || []).map(imagePickerAssetDescriptor).filter(Boolean);
  }, [maxItems]);

  const requestMoreAccess = useCallback(async () => {
    if (!isInlineLibrary || permission?.accessPrivileges !== 'limited') return;
    await MediaLibrary.presentPermissionsPickerAsync([MediaLibrary.MediaType.photo]);
    await loadInitial();
  }, [isInlineLibrary, loadInitial, permission?.accessPrivileges]);

  const materialize = useCallback(async (item) => {
    if (!item?.assetId || Platform.OS !== 'ios') {
      return { ...item, sourceUri: item?.sourceUri || item?.uri, persistence: 'ready' };
    }
    const info = await MediaLibrary.getAssetInfoAsync(item.assetId, {
      shouldDownloadFromNetwork: true,
    });
    const sourceUri = info?.localUri || info?.uri;
    if (!sourceUri) throw new Error('The selected photo could not be downloaded.');
    return {
      ...item,
      sourceUri,
      uri: sourceUri,
      previewUri: item.previewUri || item.uri || sourceUri,
      width: Number(info.width) || item.width,
      height: Number(info.height) || item.height,
      persistence: 'ready',
    };
  }, []);

  return useMemo(() => ({
    kind: isInlineLibrary ? 'inline-library' : 'system-picker',
    permission,
    albums,
    selectedAlbum,
    assets,
    hasNextPage,
    loading,
    error,
    loadInitial,
    loadMore,
    chooseAlbum,
    pickMore,
    requestMoreAccess,
    materialize,
  }), [
    albums, assets, chooseAlbum, error, hasNextPage, isInlineLibrary, loadInitial, loadMore,
    loading, materialize, permission, pickMore, requestMoreAccess, selectedAlbum,
  ]);
}
