!ifndef BUILD_UNINSTALLER
  !ifndef ONE_CLICK
    !include "LogicLib.nsh"
    !include "nsDialogs.nsh"

    Var DshDirectoryPage
    Var DshDirectoryEdit
    Var DshDirectoryNormalizationActive

    ; MUI invokes this after the assisted installer's directory page is ready.
    ; Normalize a selected drive root immediately so the page does not reject it
    ; before electron-builder's later install-time sanitization can run.
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW DshDirectoryPageShow

    Function DshDirectoryPageShow
      FindWindow $DshDirectoryPage "#32770" "" $HWNDPARENT
      GetDlgItem $DshDirectoryEdit $DshDirectoryPage 1019
      ${NSD_OnChange} $DshDirectoryEdit DshDirectoryChanged
      Call DshNormalizeDriveRoot
    FunctionEnd

    Function DshDirectoryChanged
      Pop $0
      Call DshNormalizeDriveRoot
    FunctionEnd

    Function DshNormalizeDriveRoot
      ${If} $DshDirectoryNormalizationActive == "1"
        Return
      ${EndIf}

      ${NSD_GetText} $DshDirectoryEdit $0
      StrLen $1 $0

      ; Accept both forms produced by typing or the Windows folder picker:
      ; "D:" and "D:\". Any non-root directory is left untouched.
      ${If} $1 == 2
        StrCpy $2 $0 1 1
        ${If} $2 != ":"
          Return
        ${EndIf}
        StrCpy $3 "$0\${APP_FILENAME}"
      ${ElseIf} $1 == 3
        StrCpy $2 $0 1 1
        ${If} $2 != ":"
          Return
        ${EndIf}
        StrCpy $2 $0 1 2
        ${If} $2 != "\"
          Return
        ${EndIf}
        StrCpy $3 "$0${APP_FILENAME}"
      ${Else}
        Return
      ${EndIf}

      StrCpy $DshDirectoryNormalizationActive "1"
      StrCpy $INSTDIR $3
      ${NSD_SetText} $DshDirectoryEdit $3
      StrCpy $DshDirectoryNormalizationActive "0"
    FunctionEnd

    ; Auto-create the installation directory tree before install begins.
    ; This allows users to type any path (e.g. D:\casleo) directly
    ; without needing to pre-create parent folders first.
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE DshEnsureInstDirExists

    Function DshEnsureInstDirExists
      CreateDirectory "$INSTDIR"
    FunctionEnd

    ; Accept any directory path the user types, even if it does not exist yet.
    ; Without this override NSIS rejects non-existent paths before the user
    ; can click Next.
    !macro preInit
    !macroend
    Function .onVerifyInstDir
      ; Always pass — we create the directory in DshEnsureInstDirExists.
    FunctionEnd

    ; Enable Win32 long paths (260+ char limit bypass) on Windows 10/11
    ; to avoid ENOENT errors on deeply nested workspace or plugin paths.
    ;
    ; The Defender exclusions are deliberately narrow: only the two trees that
    ; hold the tens of thousands of dependency files - the unpacked asar's
    ; node_modules and the web profile's node_modules. The application code
    ; itself stays inside the scanned asar, and the data directory keeps its
    ; protection except for the profile's module tree; a user-writable
    ; directory excluded from Defender is otherwise a guaranteed scan-free
    ; home for anything dropped there later.
    ;
    ; PowerShell is always present on Windows 10/11. -ErrorAction SilentlyContinue
    ; means a non-elevated install (where the Defender API requires admin) fails
    ; silently rather than aborting - the app still runs, just with the first-
    ; launch scan. Re-running the installer as admin adds the exclusions.
    !macro customInstall
      ; Record the pre-install LongPathsEnabled value so the uninstaller can
      ; restore it. The sentinel 2 means "the value did not exist before".
      ClearErrors
      ReadRegDWORD $0 HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled"
      ${If} ${Errors}
        WriteRegDWORD HKLM "Software\Casleo\Installer" "LongPathsEnabledPrev" 2
      ${ElseIf} $0 != 1
        WriteRegDWORD HKLM "Software\Casleo\Installer" "LongPathsEnabledPrev" $0
      ${EndIf}
      WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled" 1
      ; Direct attempt (succeeds if installer was executed as Administrator)
      nsExec::ExecToLog 'powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath \"$INSTDIR\resources\app.asar.unpacked\node_modules\" -ErrorAction SilentlyContinue; Add-MpPreference -ExclusionPath \"$APPDATA\casleo\harness\profiles\web\node_modules\" -ErrorAction SilentlyContinue"'
      ; When running non-elevated (default user install), apply the same
      ; settings from an elevated pass. If UAC is accepted, Defender stops
      ; scanning the tens of thousands of profile files on first launch.
      ;
      ; The elevated pass goes through a script file executed with
      ; `Start-Process powershell.exe ... -File <script>` rather than
      ; `Start-Process <script> -Verb RunAs`: by default Windows opens .ps1
      ; files in Notepad, so handing the script path to Start-Process as the
      ; FilePath would open the script instead of executing it.
      ;
      ; The script name carries a per-run tick so a predictable well-known
      ; path cannot be pre-planted, and the file is deleted immediately after
      ; the elevated pass returns. The paths are baked into the script text at
      ; generation time, so no user-controlled value travels through a
      ; command line that could be re-parsed differently.
      System::Call 'kernel32::GetTickCount()i.r8'
      ${IfNot} ${Silent}
        FileOpen $9 "$TEMP\casleo-elevate-$8.ps1" w
        FileWrite $9 "$$ErrorActionPreference = 'SilentlyContinue'$\r$\n"
        FileWrite $9 "Add-MpPreference -ExclusionPath '$INSTDIR\resources\app.asar.unpacked\node_modules'$\r$\n"
        FileWrite $9 "Add-MpPreference -ExclusionPath '$APPDATA\casleo\harness\profiles\web\node_modules'$\r$\n"
        FileWrite $9 "Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -ErrorAction SilentlyContinue$\r$\n"
        FileClose $9
        nsExec::ExecToLog "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command $\"Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue -ArgumentList @('-NonInteractive','-NoProfile','-ExecutionPolicy','Bypass','-File','$\"$TEMP\casleo-elevate-$8.ps1$\"')$\""
        Delete "$TEMP\casleo-elevate-$8.ps1"
      ${EndIf}
    !macroend
  !endif
!endif

!ifndef ONE_CLICK
  ; Restore what customInstall changed outside the app's own footprint:
  ; the narrowed Defender exclusions and, when this installer was the one
  ; that flipped it, the previous LongPathsEnabled value.
  ;
  ; LogicLib is included again because this macro is compiled into the
  ; uninstaller, whose BUILD_UNINSTALLER pass skipped the installer-only
  ; include block above.
  !include "LogicLib.nsh"
  !macro customUnInstall
    ClearErrors
    ReadRegDWORD $0 HKLM "Software\Casleo\Installer" "LongPathsEnabledPrev"
    ${IfNot} ${Errors}
      ${If} $0 == 2
        DeleteRegValue HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled"
      ${Else}
        WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled" $0
      ${EndIf}
    ${EndIf}
    DeleteRegKey HKLM "Software\Casleo\Installer"
    nsExec::ExecToLog 'powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Remove-MpPreference -ExclusionPath \"$INSTDIR\resources\app.asar.unpacked\node_modules\" -ErrorAction SilentlyContinue; Remove-MpPreference -ExclusionPath \"$APPDATA\casleo\harness\profiles\web\node_modules\" -ErrorAction SilentlyContinue"'
  !macroend
!endif

