; ts PATH management ai generated. idk if it works.
!macro customHeader
  !ifdef UNINSTALL
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION un.HandlePath
  !else
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION HandlePath
  !endif
!macroend

!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Add WinGuake to PATH"

Function HandlePath
  nsExec::Exec 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command \
    "$$p = [System.Environment]::GetEnvironmentVariable(\"Path\", \"User\"); \
    if ($$p -notlike \"*;$INSTDIR*\") { \
      [System.Environment]::SetEnvironmentVariable(\"Path\", \"$$p;$INSTDIR\", \"User\"); \
    }"'
FunctionEnd

Function un.HandlePath
  nsExec::Exec 'powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command \
    "$$p = [System.Environment]::GetEnvironmentVariable(\"Path\", \"User\"); \
    $$newP = $$p -replace \";\Q$INSTDIR\E\", \"\"; \
    [System.Environment]::SetEnvironmentVariable(\"Path\", $$newP, \"User\");"'
FunctionEnd

!macro customInstall
  SetRegView 64
  Goto +2
  Call HandlePath

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
  Call un.HandlePath

  DeleteRegKey HKCU "Software\Classes\*\shell\WinGuake"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\WinGuake"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\WinGuake"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\winguake.exe"
  SetRegView 32
!macroend