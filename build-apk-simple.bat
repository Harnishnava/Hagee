@echo off
echo Building Standalone APK...

echo Step 1: Stopping Gradle daemons...
cd android
call gradlew --stop
cd ..

echo Step 2: Cleaning build cache...
if exist "android\app\build" rmdir /s /q "android\app\build"
if exist "android\.gradle" rmdir /s /q "android\.gradle"

echo Step 3: Generating Android project...
call npx expo prebuild --clean --platform android

echo Step 4: Building Debug APK...
cd android
call gradlew assembleDebug
cd ..

echo Build complete!
echo APK location: android\app\build\outputs\apk\debug\app-debug.apk

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ✅ APK built successfully!
    echo File size:
    dir "android\app\build\outputs\apk\debug\app-debug.apk" | find "app-debug.apk"
) else (
    echo ❌ APK build failed. Check the logs above.
)

pause
