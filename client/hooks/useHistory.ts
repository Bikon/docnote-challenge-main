import { useCallback, useEffect, useState } from "react";
import * as FileSystem from "expo-file-system";

export type RecordingItem = {
  uri: string;
  name: string;
  modified: number;
};

export function useHistory() {
  const [history, setHistory] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const dir = FileSystem.documentDirectory + "recordings/";
      const files = await FileSystem.readDirectoryAsync(dir);
      const items: RecordingItem[] = [];

      for (const file of files) {
        const fullPath = dir + file;
        const info = await FileSystem.getInfoAsync(fullPath);
        if (info.exists) {
          items.push({
            uri: fullPath,
            name: file,
            modified: info.modificationTime || 0,
          });
        }
      }

      const sorted = items.sort((a, b) => b.modified - a.modified);
      setHistory(sorted);
    } catch (err) {
      console.error("Error loading history", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteRecording = async (uri: string) => {
    try {
      await FileSystem.deleteAsync(uri);
      setHistory((prev) => prev.filter((item) => item.uri !== uri));
    } catch (err) {
      console.error("Error deleting file", err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    history,
    loading,
    loadHistory,
    deleteRecording,
  };
}
