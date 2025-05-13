import React, { useState } from "react";
import { View, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useRecording } from "../hooks/useRecording";
import RecordingControls from "../components/RecordingControls";
import { processAudioForTranscription } from "../utils/audioProcessor";

const RecordingScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    status,
    durationMillis,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useRecording();

  const [isProcessing, setIsProcessing] = useState(false);

  const handleTranscription = async () => {
    try {
      setIsProcessing(true);
      const uri = await stopRecording();
      if (!uri) {
        setIsProcessing(false);
        Alert.alert("Error", "No audio was recorded.");
        return;
      }

      const transcript = await processAudioForTranscription(uri);
      setIsProcessing(false);
      navigation.navigate("Report", { transcript, audioUri: uri });
    } catch (error) {
      setIsProcessing(false);
      Alert.alert("Transcription Error", "Failed to transcribe audio.");
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <RecordingControls
        status={status}
        durationMillis={durationMillis}
        onStart={startRecording}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onStop={handleTranscription}
      />
      {isProcessing && <ActivityIndicator size="large" color="#007AFF" />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
});

export default RecordingScreen;
