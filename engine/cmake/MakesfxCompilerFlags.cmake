# Compiler flags shared by every make-sfx target.
#
# The determinism contract (spec §5.2) depends on these flags: no fast-math,
# no floating-point contraction (FMA fusing), IEEE semantics everywhere.
# Do not add -ffast-math, -Ofast, /fp:fast or -ffp-contract=fast to any target.

function(makesfx_apply_flags target)
  if(MSVC)
    target_compile_options(${target} PRIVATE
      /fp:precise    # contraction stays off: /fp:contract is never passed
      /permissive-
      /utf-8
      /W4)
    if(MAKESFX_WERROR)
      target_compile_options(${target} PRIVATE /WX)
    endif()
  else()
    target_compile_options(${target} PRIVATE
      -ffp-contract=off
      -fno-fast-math
      -fno-associative-math
      -fno-reciprocal-math
      # -Wsign-conversion: Clang's -Wconversion implies it, GCC's does not.
      -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion -Wshadow -Wdouble-promotion)
    if(MAKESFX_WERROR)
      target_compile_options(${target} PRIVATE -Werror)
    endif()
    if(MAKESFX_NO_EXCEPTIONS)
      target_compile_options(${target} PRIVATE -fno-exceptions)
    endif()
    if(MAKESFX_SANITIZE)
      target_compile_options(${target} PRIVATE -fsanitize=${MAKESFX_SANITIZE} -fno-omit-frame-pointer)
      target_link_options(${target} PRIVATE -fsanitize=${MAKESFX_SANITIZE})
    endif()
  endif()
endfunction()
