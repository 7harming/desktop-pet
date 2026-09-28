; The installer password check value, the same as passwordHash() in scripts/installer-password.mjs: SHA-256 of
; INSTALL_PASSWORD_SALT + password, then of each result again, INSTALL_PASSWORD_ROUNDS times in all. StdUtils::HashText
; hashes the UTF-8 bytes and gives upper-case hex.

!macro PasswordHash out password
  Push `${password}`
  Call PasswordHashFn
  Pop ${out}
!macroend

Function PasswordHashFn
  Exch $0                       ; the password
  Push $1
  Push $2
  StrCpy $1 "${INSTALL_PASSWORD_SALT}$0"
  StrCpy $2 0
  hash_loop:
    ${StdUtils.HashText} $1 "SHA2-256" $1
    IntOp $2 $2 + 1
    IntCmp $2 ${INSTALL_PASSWORD_ROUNDS} hash_done hash_loop hash_done
  hash_done:
  StrCpy $0 $1
  Pop $2
  Pop $1
  Exch $0
FunctionEnd
