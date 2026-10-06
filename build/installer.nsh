!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Alohamora"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Alohamora.lnk"
!macroend
