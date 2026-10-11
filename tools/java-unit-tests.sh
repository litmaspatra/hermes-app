#!/bin/bash
# Run Android-independent Java tests without Gradle or an Android jar.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG=android/src/com/omarqaterge/hermesmobile
TEST=android/test/com/omarqaterge/hermesmobile
required=(
  "$PKG/ApprovalPolicy.java"
  "$PKG/VoiceCommands.java"
  "$TEST/ApprovalPolicyTest.java"
  "$TEST/VoiceCommandsTest.java"
)
for file in "${required[@]}"; do
  if [ ! -f "$file" ]; then
    echo "java-unit-tests: pending (pure Java sources land in phases 3 and 4)"
    exit 0
  fi
done

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
javac -encoding UTF-8 -source 11 -target 11 -d "$out" "${required[@]}"
java -cp "$out" com.omarqaterge.hermesmobile.ApprovalPolicyTest
java -cp "$out" com.omarqaterge.hermesmobile.VoiceCommandsTest
echo "java-unit-tests: OK"
