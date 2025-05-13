import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";

type RecordingStatus = "idle" | "recording" | "paused" | "stopped";

export function useRecording() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [durationMillis, setDurationMillis] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      alert("Permission to access microphone is required!");
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const newRecording = new Audio.Recording();
    await newRecording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
    await newRecording.startAsync();

    setRecording(newRecording);
    setStatus("recording");
    setDurationMillis(0);

    intervalRef.current = setInterval(() => {
      setDurationMillis((prev) => prev + 1000);
    }, 1000);
  };

  const pauseRecording = async () => {
    if (!recording) return;
    await recording.pauseAsync();
    setStatus("paused");
    clearInterval(intervalRef.current!);
  };

  const resumeRecording = async () => {
    if (!recording) return;
    await recording.startAsync();
    setStatus("recording");
    intervalRef.current = setInterval(() => {
      setDurationMillis((prev) => prev + 1000);
    }, 1000);
  };

  const stopRecording = async (): Promise<string | null> => {
    if (!recording) return null;
    await recording.stopAndUnloadAsync();
    clearInterval(intervalRef.current!);

    const uri = recording.getURI();
    setAudioUri(uri || null);
    setRecording(null);
    setStatus("stopped");
    return uri || null;
  };

  const resetRecording = () => {
    setAudioUri(null);
    setStatus("idle");
    setDurationMillis(0);
  };

  return {
    status,
    durationMillis,
    audioUri,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
  };
}
