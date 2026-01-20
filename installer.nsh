!macro customInstall
  SetRegView 64
  Goto +2

  WriteRegStr HKCU "Software\Classes\*\shell\WinGuake" "" "Open with WinGuake"
  WriteRegStr HKCU "Software\Classes\*\shell\WinGuake" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\*\shell\WinGuake\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\WinGuake" "" "Open in WinGuake"
  WriteRegStr HKCU "Software\Classes\Directory\shell\WinGuake" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\WinGuake\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WinGuake" "" "Open WinGuake here"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WinGuake" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\WinGuake\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\winguake.exe" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\winguake.exe" "Path" "$INSTDIR"
  SetRegView 32
!macroend

!macro customUnInstall
  SetRegView 64

  DeleteRegKey HKCU "Software\Classes\*\shell\WinGuake"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\WinGuake"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\WinGuake"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\winguake.exe"
  SetRegView 32
!macroend