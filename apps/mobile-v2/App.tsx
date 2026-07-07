import 'react-native-gesture-handler';
import {ThemeProvider} from './src/theme/ThemeProvider';
import {HomeScreen} from './src/screens/HomeScreen';

export default function App() {
  return (
    <ThemeProvider>
      <HomeScreen />
    </ThemeProvider>
  );
}