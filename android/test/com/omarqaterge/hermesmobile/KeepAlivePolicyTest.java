package com.omarqaterge.hermesmobile;

public final class KeepAlivePolicyTest {
    static int passed;

    static void check(boolean condition, String name) {
        if (!condition) throw new AssertionError(name);
        passed++;
    }

    public static void main(String[] args) {
        check(KeepAlivePolicy.nextDelay(1_100, 1_000, 0, true, false) == 700,
                "first wake is 800 ms after hiding");
        check(KeepAlivePolicy.nextDelay(1_800, 1_000, 0, true, false) == 0,
                "first wake dispatches at 800 ms");
        check(KeepAlivePolicy.nextDelay(2_000, 1_000, 0, true, true) == 15_000,
                "active visible page loops every 15 seconds");
        check(KeepAlivePolicy.nextDelay(2_000, 1_000, 3_000, false, true) == 15_000,
                "explicit hold keeps loop active");
        check(KeepAlivePolicy.nextDelay(3_001, 1_000, 3_000, false, true) == -1,
                "idle expired hold stops the loop");
        System.out.println("KeepAlivePolicyTest: " + passed + " passed");
    }
}
