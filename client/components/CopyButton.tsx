import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";

type Props = {
  text: string;
};

const CopyButton: React.FC<Props> = ({ text }) => {
  const handleCopy = () => {
    Clipboard.setStringAsync(text);
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleCopy}>
      <Text style={styles.buttonText}>Copy</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignSelf: "flex-end",
    marginBottom: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
});

export default CopyButton;
