import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";
import { clearLocalAudioFiles } from "../utils/audioProcessor";

const SettingsScreen: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClearStorage = async () => {
    Alert.alert("Clear App Data", "This action cannot be undone. Proceed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setIsDeleting(true);
            await clearLocalAudioFiles();
            Alert.alert("Success", "App data cleared.");
          } catch (err) {
            Alert.alert("Error", "Failed to clear app data.");
            console.error(err);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.sectionDanger}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Text style={styles.sectionSubtitle}>
            These actions are permanent and cannot be undone.
          </Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleClearStorage}
            disabled={isDeleting}
          >
            <FontAwesome name="trash" size={16} color="#fff" />
            <Text style={styles.dangerButtonText}> Clear App Data</Text>
          </TouchableOpacity>
          {isDeleting && (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.loadingText}>Deleting...</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>About</Text>

          <View style={styles.item}>
            <View style={styles.left}>
              <FontAwesome name="info-circle" size={20} color="#007AFF" />
              <Text style={styles.itemText}>App Information</Text>
            </View>
            <FontAwesome name="angle-right" size={20} color="#ccc" />
          </View>

          <View style={styles.item}>
            <View style={styles.left}>
              <FontAwesome name="question-circle" size={20} color="#007AFF" />
              <Text style={styles.itemText}>Help & Support</Text>
            </View>
            <FontAwesome name="angle-right" size={20} color="#ccc" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f7",
  },
  sectionDanger: {
    backgroundColor: "#fff",
    borderColor: "#f44336",
    borderWidth: 1,
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 4,
    color: "#d32f2f",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  },
  dangerButton: {
    backgroundColor: "#d32f2f",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 4,
  },
  dangerButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#fff",
    fontSize: 13,
  },
  section: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 32,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginVertical: 12,
    marginLeft: 12,
  },
  item: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemText: {
    fontSize: 15,
    color: "#333",
  },
});

export default SettingsScreen;
