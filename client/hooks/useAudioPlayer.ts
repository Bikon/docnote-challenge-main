import { useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";

export function useAudioPlayer(uri: string | null) {
  const sound = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uri) return;

    const loadSound = async () => {
      try {
        const { sound: playbackObject } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
          onPlaybackStatusUpdate
        );
        sound.current = playbackObject;
        setLoading(false);
      } catch (err) {
        console.error("Failed to load sound", err);
      }
    };

    loadSound();

    return () => {
      if (sound.current) {
        sound.current.unloadAsync();
      }
    };
  }, [uri]);

  const onPlaybackStatusUpdate = (status: Audio.AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPosition(status.positionMillis);
    setDuration(status.durationMillis || 0);
    setIsPlaying(status.isPlaying);
  };

  const playPause = async () => {
    if (!sound.current) return;
    const status = await sound.current.getStatusAsync();
    if (status.isLoaded) {
      if (status.isPlaying) {
        await sound.current.pauseAsync();
      } else {
        await sound.current.playAsync();
      }
    }
  };

  const seekTo = async (value: number) => {
    if (!sound.current) return;
    await sound.current.setPositionAsync(value);
  };

  return {
    isPlaying,
    duration,
    position,
    loading,
    playPause,
    seekTo,
  };
}
