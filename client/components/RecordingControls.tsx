import React from "react";
import { View, Text, StyleSheet } from "react-native";
import RecordButton from "./RecordButton";
import TimeDisplay from "./TimeDisplay";

type Props = {
  isRecording: boolean;
  durationMillis: number;
  onRecordPress: () => void;
};

const RecordingControls: React.FC<Props> = ({
  isRecording,
  durationMillis,
  onRecordPress,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {isRecording ? "Recording..." : "Tap to start recording"}
      </Text>
      <TimeDisplay durationMillis={durationMillis} />
      <RecordButton isRecording={isRecording} onPress={onRecordPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 20,
  },
  label: {
    fontSize: 18,
    marginBottom: 10,
    color: "#333",
  },
});

export default RecordingControls;
