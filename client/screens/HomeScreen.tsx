import { FontAwesome } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import StartRecordingButton from '../components/StartRecordingButton';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>DocNote</Text>
        <Text style={styles.subtitle}>
          Record audio and generate medical reports
        </Text>

        <View style={styles.imageContainer}>
          <Image
            source={require('../assets/icon.webp')}
            style={styles.image}
            resizeMode='contain'
          />
        </View>

        <StartRecordingButton onPress={() => navigation.navigate('Recording')} />

        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <FontAwesome name='file-text-o' size={20} color='#007AFF' />
            <Text style={styles.infoText}>Create detailed medical reports</Text>
          </View>

          <View style={styles.infoItem}>
            <FontAwesome name='clock-o' size={20} color='#007AFF' />
            <Text style={styles.infoText}>Save time on documentation</Text>
          </View>

          <View style={styles.infoItem}>
            <FontAwesome name='lock' size={20} color='#007AFF' />
            <Text style={styles.infoText}>Secure and private</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

// стили
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#007AFF',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  imageContainer: {
    width: 150,
    height: 150,
    marginBottom: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    marginTop: 40,
    width: '100%',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#333',
  },
});

export default HomeScreen;
