import * as DocumentPicker from 'expo-document-picker';
import { previewWqiFile } from '@/features/predictions/batch-api';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export type Picked = { uri: string; name: string; size?: number };
export async function pickWorkbook(): Promise<Picked | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [XLSX, 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const { uri, name, size } = result.assets[0];
  return { uri, name, size };
}

/** React Native's FormData sends a file given as { uri, name, type }; the shared web call does the rest (CSRF token, errors). */
export const uploadWorkbook = (file: Picked) => previewWqiFile({ uri: file.uri, name: file.name, type: XLSX } as unknown as File);
