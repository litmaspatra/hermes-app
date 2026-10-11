package com.omarqaterge.hermesmobile;

public final class ApprovalQueueTest {
    static int passed;

    static void check(boolean condition, String name) {
        if (!condition) throw new AssertionError(name);
        passed++;
    }

    public static void main(String[] args) {
        ApprovalQueue<String> q = new ApprovalQueue<>();

        q.upsert("chat", "r1", "ls", 1_000, 61_000, "first");
        q.upsert("chat", "r2", "pwd", 2_000, 62_000, "second");
        check(q.size() == 2, "two requests in one chat coexist");
        check("r1".equals(q.oldest().requestId), "oldest request is first");

        q.upsert("chat", "r1", "ls -la", 3_000, 90_000, "refreshed");
        check(q.size() == 2, "repeat request never duplicates");
        check("refreshed".equals(q.oldest().value), "repeat refreshes payload");
        check(q.oldest().deadline == 90_000, "repeat refreshes deadline");

        ApprovalQueue.Entry<String> cleared = q.clearOldest("chat", 4_000);
        check(cleared != null && "r1".equals(cleared.requestId), "clear removes oldest in session");
        check("r2".equals(q.oldest().requestId), "second request remains");

        ApprovalQueue.Entry<String> answered = q.removeAnswered("chat", "r2", "pwd", 5_000);
        check(answered != null && q.size() == 0, "successful answer removes matching request");
        check(q.clearOldest("chat", 24_999) == null, "matching clear is consumed for twenty seconds");

        q.upsert("chat", "r3", "date", 25_000, 30_000, "third");
        check(q.clearOldest("chat", 25_001) != null, "consumed clear does not hide later clears");

        q.upsert("chat", "", "git status", 30_000, 40_000, "fallback");
        q.upsert("chat", "", "git status", 31_000, 41_000, "fallback-refresh");
        check(q.size() == 1, "session plus command is fallback identity");
        check("fallback-refresh".equals(q.oldest().value), "fallback identity refreshes");

        check(q.removeStale(340_999).isEmpty(), "countdown zero never removes approval");
        check(q.size() == 1, "approval stays through stale grace");
        check(q.removeStale(341_001).size() == 1 && q.size() == 0, "five-minute stale guard removes approval");

        q.upsert("a", "same", "ls", 1, 100, "a");
        q.upsert("b", "same", "ls", 2, 100, "b");
        check(q.size() == 2, "request ids are scoped by session");
        check(q.requestCodeSeed(q.oldest(), "once").equals("a|same|once"), "button identity includes session request and choice");

        System.out.println("ApprovalQueueTest: " + passed + " passed");
    }
}
