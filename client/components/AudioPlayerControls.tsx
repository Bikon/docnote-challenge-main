import React from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import Slider from "@react-native-community/slider";
import { FontAwesome } from "@expo/vector-icons";

type Props = {
  isPlaying: boolean;
  duration: number;
  position: number;
  onPlayPause: () => void;
  onSeek: (value: number) => void;
};

const formatTime = (millis: number) => {
  const minutes = Math.floor(millis / 60000);
  const seconds = Math.floor((millis % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const AudioPlayerControls: React.FC<Props> = ({
  isPlaying,
  duration,
  position,
  onPlayPause,
  onSeek,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onPlayPause} style={styles.playButton}>
        <FontAwesome name={isPlaying ? "pause" : "play"} size={24} color="#fff" />
      </TouchableOpacity>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration}
        value={position}
        onSlidingComplete={onSeek}
        minimumTrackTintColor="#007AFF"
        maximumTrackTintColor="#ccc"
        thumbTintColor="#007AFF"
      />

      <View style={styles.timeContainer}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
    width: "100%",
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "#007AFF",
    borderRadius: 30,
    padding: 15,
    marginBottom: 10,
  },
  slider: {
    width: "90%",
    height: 40,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "90%",
  },
  time: {
    fontSize: 14,
    color: "#555",
  },
});

export default AudioPlayerControls;
