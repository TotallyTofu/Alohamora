; Tauri NSIS installer hooks (bundle.windows.nsis.installerHooks).
; Uninstall removes what the app created itself: the right-click verb, the Send To shortcut, the login entry.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\Alohamora"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Alohamora.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Alohamora"
!macroend
