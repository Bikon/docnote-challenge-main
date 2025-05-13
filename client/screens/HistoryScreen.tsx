import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHistory } from "../hooks/useHistory";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

const HistoryScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { loading, history, loadHistory } = useHistory();

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const renderItem = ({ item }: any) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() =>
        navigation.navigate("Report", {
          transcript: item.transcript,
          audioUri: item.audioUri,
        })
      }
    >
      <Text numberOfLines={1} style={styles.transcript}>
        {item.transcript || "No transcript"}
      </Text>
      <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : history.length === 0 ? (
        <Text style={styles.empty}>No recordings found.</Text>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  item: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  transcript: {
    fontSize: 16,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: "#666",
  },
  empty: {
    marginTop: 32,
    textAlign: "center",
    color: "#666",
    fontSize: 16,
  },
});

export default HistoryScreen;
