import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

type RecordButtonProps = {
  isRecording: boolean;
  onPress: () => void;
};

const RecordButton: React.FC<RecordButtonProps> = ({ isRecording, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.button}>
      <FontAwesome
        name={isRecording ? "stop" : "microphone"}
        size={28}
        color="#fff"
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#007AFF",
    padding: 20,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
});

export default RecordButton;
