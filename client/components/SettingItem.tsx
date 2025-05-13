import React from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

type Props = {
  icon: string;
  title: string;
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
};

const SettingItem: React.FC<Props> = ({
  icon,
  title,
  value,
  onToggle,
  onPress,
  disabled,
}) => {
  return (
    <TouchableOpacity
      style={[styles.item, disabled && styles.disabled]}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.left}>
        <FontAwesome name={icon as any} size={20} color="#007AFF" />
        <Text style={styles.text}>{title}</Text>
      </View>
      {typeof value === "boolean" && onToggle ? (
        <Switch value={value} onValueChange={onToggle} />
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  text: {
    fontSize: 16,
    color: "#333",
  },
  disabled: {
    opacity: 0.5,
  },
});

export default SettingItem;
