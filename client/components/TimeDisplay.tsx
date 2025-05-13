import React from "react";
import { Text, StyleSheet } from "react-native";

type Props = {
  durationMillis: number;
};

const TimeDisplay: React.FC<Props> = ({ durationMillis }) => {
  const minutes = Math.floor(durationMillis / 60000);
  const seconds = Math.floor((durationMillis % 60000) / 1000);
  const padded = (n: number) => n.toString().padStart(2, "0");

  return (
    <Text style={styles.time}>
      {padded(minutes)}:{padded(seconds)}
    </Text>
  );
};

const styles = StyleSheet.create({
  time: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 20,
  },
});

export default TimeDisplay;
