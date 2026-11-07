// expo-router and expo-modules-core pull these in as optional peers; the app uses none of them.
// Left out of the native build: fewer native libraries, and gesture-handler's C++ paths pass Windows' 260-character limit.
const off = { platforms: { android: null, ios: null } };
module.exports = {
  dependencies: { 'react-native-gesture-handler': off, 'react-native-reanimated': off, 'react-native-worklets': off },
};
