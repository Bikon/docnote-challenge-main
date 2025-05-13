import { FontAwesome } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearLocalAudioFiles } from '../utils/audioProcessor';
import SettingItem from '../components/SettingItem';

const SettingsScreen: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleClearStorage = async () => {
    Alert.alert("Clear Local Files", "Are you sure you want to delete all saved recordings?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setIsDeleting(true);
            await clearLocalAudioFiles();
            Alert.alert("Success", "All recordings deleted.");
          } catch (err) {
            Alert.alert("Error", "Failed to delete recordings.");
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
      <Text style={styles.title}>Settings</Text>
      <ScrollView>
        <SettingItem
          icon="bell"
          title="Notifications"
          value={notificationsEnabled}
          onToggle={setNotificationsEnabled}
        />
        <SettingItem
          icon="trash"
          title="Clear All Recordings"
          onPress={handleClearStorage}
          disabled={isDeleting}
        />
        {isDeleting && (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.loadingText}>Deleting files...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 20,
    textAlign: "center",
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    gap: 10,
  },
  loadingText: {
    color: "#007AFF",
  },
});

export default SettingsScreen;
