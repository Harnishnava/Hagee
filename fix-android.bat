@echo off
echo "🔧 Fixing Android Build Issues..."

echo "1. Stopping all Gradle daemons..."
cd android
call gradlew --stop
cd ..

echo "2. Cleaning build caches..."
rmdir /s /q android\.gradle 2>nul
rmdir /s /q android\app\.cxx 2>nul
rmdir /s /q android\.cxx 2>nul
rmdir /s /q node_modules\react-native-reanimated\android\.cxx 2>nul
rmdir /s /q node_modules\@react-native-async-storage\async-storage\android\.cxx 2>nul
rmdir /s /q node_modules\react-native-gesture-handler\android\.cxx 2>nul

echo "3. Cleaning React Native cache..."
npx react-native clean

echo "4. Cleaning Metro cache..."
npx react-native start --reset-cache --port 8081 &
timeout /t 3
taskkill /f /im node.exe 2>nul

echo "5. Reinstalling dependencies..."
rmdir /s /q node_modules 2>nul
del package-lock.json 2>nul
npm install

echo "6. Prebuild for Expo..."
npx expo prebuild --clean

echo "7. Building Android..."
cd android
call gradlew clean
call gradlew assembleDebug
cd ..

echo "✅ Android build fix completed!"
echo "📱 APK location: android\app\build\outputs\apk\debug\app-debug.apk"
pause
