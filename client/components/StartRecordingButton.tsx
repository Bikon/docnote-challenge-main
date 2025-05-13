import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

type Props = {
  onPress: () => void;
};

const StartRecordingButton: React.FC<Props> = ({ onPress }) => {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <FontAwesome name="microphone" size={24} color="#fff" style={styles.icon} />
      <Text style={styles.text}>Start Recording</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    backgroundColor: "#007AFF",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});

export default StartRecordingButton;
