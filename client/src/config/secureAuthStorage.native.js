import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'planli.auth';
const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 64;
const SECURE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function keyHash(key) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(key));
}

async function metadataKey(key) {
  return `${PREFIX}.${await keyHash(key)}.meta`;
}

function chunkKey(hash, generation, index) {
  return `${PREFIX}.${hash}.${generation}.${index}`;
}

async function readMetadata(key) {
  const raw = await SecureStore.getItemAsync(await metadataKey(key), SECURE_OPTIONS);
  if (!raw) return null;
  try {
    const metadata = JSON.parse(raw);
    if (
      metadata?.version !== 1
      || !/^[a-f0-9-]{16,64}$/i.test(String(metadata.generation || ''))
      || !Number.isInteger(metadata.chunks)
      || metadata.chunks < 1
      || metadata.chunks > MAX_CHUNKS
    ) return null;
    return metadata;
  } catch {
    return null;
  }
}

async function removeGeneration(hash, metadata) {
  if (!metadata) return;
  await Promise.all(Array.from({ length: metadata.chunks }, (_, index) => (
    SecureStore.deleteItemAsync(chunkKey(hash, metadata.generation, index), SECURE_OPTIONS)
  )));
}

async function readSecureValue(key) {
  const hash = await keyHash(key);
  const metadata = await readMetadata(key);
  if (!metadata) return null;
  const chunks = await Promise.all(Array.from({ length: metadata.chunks }, (_, index) => (
    SecureStore.getItemAsync(chunkKey(hash, metadata.generation, index), SECURE_OPTIONS)
  )));
  return chunks.every((chunk) => typeof chunk === 'string') ? chunks.join('') : null;
}

async function writeSecureValue(key, value) {
  const serialized = String(value);
  const chunks = serialized.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) || [''];
  if (chunks.length > MAX_CHUNKS) throw new Error('Firebase Auth state exceeds the secure storage limit.');
  const hash = await keyHash(key);
  const previous = await readMetadata(key);
  const generation = Crypto.randomUUID();
  await Promise.all(chunks.map((chunk, index) => (
    SecureStore.setItemAsync(chunkKey(hash, generation, index), chunk, SECURE_OPTIONS)
  )));
  await SecureStore.setItemAsync(
    await metadataKey(key),
    JSON.stringify({ version: 1, generation, chunks: chunks.length }),
    SECURE_OPTIONS
  );
  await removeGeneration(hash, previous);
}

export const secureAuthStorage = {
  async getItem(key) {
    const secureValue = await readSecureValue(key);
    if (secureValue != null) return secureValue;
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue == null) return null;
    await writeSecureValue(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  },
  async setItem(key, value) {
    await writeSecureValue(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key) {
    const hash = await keyHash(key);
    const metadata = await readMetadata(key);
    await SecureStore.deleteItemAsync(await metadataKey(key), SECURE_OPTIONS);
    await removeGeneration(hash, metadata);
    await AsyncStorage.removeItem(key);
  },
};
