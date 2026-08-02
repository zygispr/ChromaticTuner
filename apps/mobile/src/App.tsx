import { StyleSheet, Text, View } from 'react-native';

// Phase 1 placeholder. TunerProvider wiring with the mobile adapters lands in
// T053; the component tree lands in T050-T053.
export default function App() {
  return (
    <View style={styles.container}>
      <Text>ChromaticTuner</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
