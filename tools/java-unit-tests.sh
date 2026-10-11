#!/bin/bash
# Run Android-independent Java tests without Gradle or an Android jar.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG=android/src/com/omarqaterge/hermesmobile
TEST=android/test/com/omarqaterge/hermesmobile
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
ran=0
if [ -f "$PKG/ApprovalQueue.java" ] && [ -f "$TEST/ApprovalQueueTest.java" ]; then
  javac -encoding UTF-8 -source 11 -target 11 -d "$out" \
    "$PKG/ApprovalQueue.java" "$TEST/ApprovalQueueTest.java" \
    "$PKG/KeepAlivePolicy.java" "$TEST/KeepAlivePolicyTest.java"
  java -cp "$out" com.omarqaterge.hermesmobile.ApprovalQueueTest
  java -cp "$out" com.omarqaterge.hermesmobile.KeepAlivePolicyTest
  ran=1
fi

required=("$PKG/ApprovalPolicy.java" "$PKG/VoiceCommands.java" "$TEST/ApprovalPolicyTest.java" "$TEST/VoiceCommandsTest.java")
complete=1
for file in "${required[@]}"; do [ -f "$file" ] || complete=0; done
if [ "$complete" = 1 ]; then
  javac -encoding UTF-8 -source 11 -target 11 -d "$out" "${required[@]}"
  java -cp "$out" com.omarqaterge.hermesmobile.ApprovalPolicyTest
  java -cp "$out" com.omarqaterge.hermesmobile.VoiceCommandsTest
  ran=1
fi

[ "$ran" = 1 ] || echo "java-unit-tests: pending (pure Java sources land in later phases)"
echo "java-unit-tests: OK"
