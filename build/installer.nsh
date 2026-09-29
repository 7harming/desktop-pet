; 打工貓貓 (was 毛孩桌寵): the installer asks for a password before anything is installed (spec appendix B.7).
; The salt, rounds and hash live in build\installer-password.nsh, which stays out of git; `npm run set-installer-password`
; writes it. electron-builder reads this file before its installer template, so everything that needs MUI2, UAC or
; LogicLib sits inside the macros below, which the template expands after including those.

!include "installer-password.nsh"

!macro customWelcomePage
  !include LogicLib.nsh
  !include nsDialogs.nsh
  !include "password-hash.nsh"

  Var PasswordInput
  Var PasswordTries

  Page custom PasswordPageShow PasswordPageLeave

  Function PasswordPageShow
    ${If} ${UAC_IsInnerInstance}
      Abort                     ; installing for all users relaunches elevated; the first instance already asked
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "安裝密碼" "安裝打工貓貓之前，請先輸入密碼。"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "請輸入安裝密碼："
    Pop $0
    ${NSD_CreatePassword} 0 22u 100% 13u ""
    Pop $PasswordInput
    ${NSD_SetFocus} $PasswordInput
    nsDialogs::Show
  FunctionEnd

  Function PasswordPageLeave
    ${NSD_GetText} $PasswordInput $0
    !insertmacro PasswordHash $1 $0
    ${If} $1 == "${INSTALL_PASSWORD_HASH}"
      Return
    ${EndIf}
    IntOp $PasswordTries $PasswordTries + 1
    ${If} $PasswordTries >= 5
      MessageBox MB_ICONSTOP "密碼錯誤太多次，安裝程式將關閉。"
      Quit
    ${EndIf}
    MessageBox MB_ICONEXCLAMATION "密碼不正確，請再試一次。"
    ${NSD_SetText} $PasswordInput ""
    Abort                       ; stay on the password page
  FunctionEnd
!macroend

; a silent install (/S) would skip the password page, so it is refused
!macro customInit
  ${If} ${Silent}
  ${AndIfNot} ${UAC_IsInnerInstance}
    SetErrorLevel 5
    Quit
  ${EndIf}
!macroend
