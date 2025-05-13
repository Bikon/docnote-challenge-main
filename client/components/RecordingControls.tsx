import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

type Props = {
  status: "idle" | "recording" | "paused" | "stopped";
  durationMillis: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

const formatTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const RecordingControls: React.FC<Props> = ({
  status,
  durationMillis,
  onStart,
  onPause,
  onResume,
  onStop,
}) => {
  const renderControls = () => {
    switch (status) {
      case "idle":
      case "stopped":
        return (
          <TouchableOpacity style={styles.buttonRed} onPress={onStart}>
            <FontAwesome name="microphone" size={24} color="#fff" />
          </TouchableOpacity>
        );
      case "recording":
        return (
          <View style={styles.row}>
            <TouchableOpacity style={styles.buttonBlue} onPress={onPause}>
              <FontAwesome name="pause" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonRed} onPress={onStop}>
              <FontAwesome name="stop" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        );
      case "paused":
        return (
          <View style={styles.row}>
            <TouchableOpacity style={styles.buttonBlue} onPress={onResume}>
              <FontAwesome name="play" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonRed} onPress={onStop}>
              <FontAwesome name="stop" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const getLabel = () => {
    if (status === "recording") return "Recording...";
    return "Ready to Record";
  };

  return (
    <View style={styles.container}>
      <Text style={styles.time}>{formatTime(durationMillis)}</Text>
      <Text style={styles.status}>{getLabel()}</Text>
      {renderControls()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 30,
  },
  time: {
    fontSize: 36,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  status: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  buttonRed: {
    backgroundColor: "tomato",
    padding: 20,
    borderRadius: 50,
    marginHorizontal: 10,
  },
  buttonBlue: {
    backgroundColor: "#007AFF",
    padding: 20,
    borderRadius: 50,
    marginHorizontal: 10,
  },
  row: {
    flexDirection: "row",
  },
});

export default RecordingControls;
