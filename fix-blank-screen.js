// Fix for blank screen issue in React Native/Expo apps
// This script helps identify and fix common blank screen causes

const fs = require('fs');
const path = require('path');

console.log('🔍 Diagnosing blank screen issue...');

// Check if main entry points exist
const checkFile = (filePath, description) => {
  const fullPath = path.join(__dirname, filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${description}: ${filePath}`);
    return true;
  } else {
    console.log(`❌ MISSING ${description}: ${filePath}`);
    return false;
  }
};

// Check critical files
console.log('\n📁 Checking critical files:');
checkFile('app.json', 'Expo config');
checkFile('package.json', 'Package config');
checkFile('app/_layout.tsx', 'Root layout');
checkFile('app/index.tsx', 'Main entry point');
checkFile('app/(tabs)/_layout.tsx', 'Tab layout');

// Check if there are any obvious errors in the main files
console.log('\n🔍 Checking for common issues:');

try {
  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  if (appJson.expo && appJson.expo.main) {
    console.log(`✅ Main entry point defined: ${appJson.expo.main}`);
  } else {
    console.log('⚠️  No main entry point defined in app.json');
  }
} catch (error) {
  console.log('❌ Error reading app.json:', error.message);
}

// Check package.json
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (packageJson.main) {
    console.log(`✅ Package main: ${packageJson.main}`);
  }
  
  // Check for critical dependencies
  const criticalDeps = ['expo', 'react', 'react-native', 'expo-router'];
  console.log('\n📦 Critical dependencies:');
  criticalDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`❌ MISSING: ${dep}`);
    }
  });
  
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
}

console.log('\n🛠️  Recommendations:');
console.log('1. Run: npx expo start --clear');
console.log('2. Try: npx expo start --tunnel');
console.log('3. Check Metro bundler logs for JavaScript errors');
console.log('4. Verify all imports in your components are correct');
console.log('5. Test with: npx expo start --dev-client');
