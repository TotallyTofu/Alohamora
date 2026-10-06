!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Kabooks"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Kabooks.lnk"
!macroend
