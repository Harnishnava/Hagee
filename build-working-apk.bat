@echo off
echo "🔧 Building APK with JavaScript Bundle (Fixes White Screen)"
echo "========================================================="

echo "Step 1: Stop Gradle and clean..."
cd android
call gradlew --stop
call gradlew clean
cd ..

echo "Step 2: Create assets directory..."
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"

echo "Step 3: Bundle JavaScript for production..."
call npx @react-native-community/cli bundle --platform android --dev false --entry-file node_modules/expo-router/entry.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res

echo "Step 4: Build APK with JavaScript bundle..."
cd android
call gradlew assembleDebug
cd ..

echo "✅ APK Build Complete!"
echo "📱 APK Location: android\app\build\outputs\apk\debug\app-debug.apk"

if exist "android\app\src\main\assets\index.android.bundle" (
    echo "✅ JavaScript bundle included in APK!"
    echo "Bundle size:"
    dir "android\app\src\main\assets\index.android.bundle" | find "index.android.bundle"
) else (
    echo "❌ JavaScript bundle missing - APK will show white screen!"
)

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo "✅ APK built successfully!"
    echo "APK size:"
    dir "android\app\build\outputs\apk\debug\app-debug.apk" | find "app-debug.apk"
    echo ""
    echo "🚀 This APK should now work without white screen!"
) else (
    echo "❌ APK build failed!"
)

pause
