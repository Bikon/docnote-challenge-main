import { FontAwesome } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import screens
import HistoryScreen from './screens/HistoryScreen';
import HomeScreen from './screens/HomeScreen';
import RecordingScreen from './screens/RecordingScreen';
import ReportScreen from './screens/ReportScreen';
import SettingsScreen from './screens/SettingsScreen';

// Define navigation types
export type RootStackParamList = {
	Main: undefined;
	Recording: undefined;
	Report: {
		audioUri?: string; // Make it optional
		recordingId?: string;
		transcription?: string;
		recommendations?: string;
		file?: {
			storageUrl?: string;
			filename?: string;
			path?: string;
		};
		recordingDuration?: number;
		isProcessing?: boolean;
		keepLocalFiles?: boolean;
		recordingTimestamp?: number;
		skipCopyingAudio?: boolean;
	};
	History: undefined;
	Settings: undefined;
};

// Define tab types
export type TabParamList = {
	History: undefined;
	Record: undefined;
	Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Tab Navigator component
const TabNavigator = () => {
	return (
		<Tab.Navigator
			screenOptions={({ route }) => ({
				tabBarIcon: ({ focused, color, size }) => {
					let iconName: string;

					if (route.name === 'History') {
						iconName = 'history';
					} else if (route.name === 'Record') {
						iconName = 'microphone';
					} else if (route.name === 'Settings') {
						iconName = 'cog';
					} else {
						iconName = 'question-circle';
					}

					return (
						<FontAwesome name={iconName as any} size={size} color={color} />
					);
				},
				tabBarActiveTintColor: '#007AFF',
				tabBarInactiveTintColor: '#999',
				tabBarStyle: {
					paddingBottom: 8,
					height: 75,
					marginTop: 5,
				},
				tabBarLabelStyle: {
					fontSize: 12,
					paddingBottom: 5,
				},
			})}
		>
			<Tab.Screen
				name='History'
				component={HistoryScreen}
				options={{
					title: 'History',
					headerShown: false,
				}}
			/>
			<Tab.Screen
				name='Record'
				component={HomeScreen}
				options={{
					title: 'Record',
					headerShown: false,
				}}
			/>
			<Tab.Screen
				name='Settings'
				component={SettingsScreen}
				options={{
					title: 'Settings',
					headerShown: false,
				}}
			/>
		</Tab.Navigator>
	);
};

export default function App() {
	return (
		<SafeAreaProvider>
			<NavigationContainer>
				<Stack.Navigator>
					<Stack.Screen
						name='Main'
						component={TabNavigator}
						options={{ headerShown: false }}
					/>
					<Stack.Screen
						name='Recording'
						component={RecordingScreen}
						options={{ title: 'Record Audio' }}
					/>
					<Stack.Screen
						name='Report'
						component={ReportScreen}
						options={{ headerShown: false }}
					/>
				</Stack.Navigator>
				<StatusBar style='auto' />
			</NavigationContainer>
		</SafeAreaProvider>
	);
}
