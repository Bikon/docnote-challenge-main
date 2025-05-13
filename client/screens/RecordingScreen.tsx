import React, { useState } from "react";
import { View, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useRecording } from "../hooks/useRecording";
import RecordingControls from "../components/RecordingControls";
import RecordButton from "../components/RecordButton";
import { processAudioForTranscription } from "../utils/audioProcessor";

const RecordingScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    isRecording,
    durationMillis,
    audioUri,
    startRecording,
    stopRecording,
  } = useRecording();

  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecordPress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleTranscription = async () => {
    if (!audioUri) return;
    try {
      setIsProcessing(true);
      const transcript = await processAudioForTranscription(audioUri);
      setIsProcessing(false);
      navigation.navigate("Report", { transcript });
    } catch (error) {
      setIsProcessing(false);
      Alert.alert("Transcription Error", "Failed to transcribe audio.");
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <RecordingControls
        isRecording={isRecording}
        durationMillis={durationMillis}
        onRecordPress={handleRecordPress}
      />
      {audioUri && !isProcessing && (
        <View style={styles.transcriptionArea}>
          <RecordButton isRecording={false} onPress={handleTranscription} />
        </View>
      )}
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
  transcriptionArea: {
    marginTop: 30,
    alignItems: "center",
  },
});

export default RecordingScreen;
