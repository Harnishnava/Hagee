@echo off
echo "🏗️ Building Standalone APK (No EAS, No Server Required)"
echo "=================================================="

echo "Step 1: Clean previous builds..."
cd android
call gradlew --stop
call gradlew clean
cd ..

echo "Step 2: Generate native Android project..."
npx expo prebuild --clean --platform android

echo "Step 3: Bundle JavaScript for production..."
npx expo export --platform android

echo "Step 4: Build release APK..."
cd android
call gradlew assembleRelease
cd ..

echo "Step 5: Build debug APK (easier to install)..."
cd android
call gradlew assembleDebug
cd ..

echo "✅ APK Build Complete!"
echo "📱 Debug APK: android\app\build\outputs\apk\debug\app-debug.apk"
echo "🚀 Release APK: android\app\build\outputs\apk\release\app-release.apk"
echo ""
echo "📋 Installation Instructions:"
echo "1. Copy APK to your phone"
echo "2. Enable 'Install from Unknown Sources' in Android settings"
echo "3. Install the APK"
echo "4. App will run completely offline without laptop!"
pause
