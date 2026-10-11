package com.omarqaterge.hermesmobile;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Ordered, request-scoped approval state with no Android dependencies. */
final class ApprovalQueue<T> {
    static final long ANSWER_CLEAR_MS = 20_000;
    static final long STALE_MS = 5 * 60_000;

    static final class Entry<T> {
        final String key;
        final String session;
        final String requestId;
        final String command;
        final long receivedAt;
        final long deadline;
        final T value;

        Entry(String key, String session, String requestId, String command,
              long receivedAt, long deadline, T value) {
            this.key = key;
            this.session = session;
            this.requestId = requestId;
            this.command = command;
            this.receivedAt = receivedAt;
            this.deadline = deadline;
            this.value = value;
        }
    }

    private final ArrayList<Entry<T>> entries = new ArrayList<>();
    private final Map<String, ArrayDeque<Long>> answered = new HashMap<>();

    private static String clean(String value) {
        return value == null ? "" : value;
    }

    private static String key(String session, String requestId, String command) {
        String s = clean(session);
        String r = clean(requestId);
        return s + '\u0000' + (r.isEmpty() ? clean(command) : r);
    }

    synchronized Entry<T> upsert(String session, String requestId, String command,
                                 long receivedAt, long deadline, T value) {
        String k = key(session, requestId, command);
        Entry<T> fresh = new Entry<>(k, clean(session), clean(requestId), clean(command),
                receivedAt, deadline, value);
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).key.equals(k)) {
                entries.set(i, fresh);
                return fresh;
            }
        }
        entries.add(fresh);
        return fresh;
    }

    synchronized int size() {
        return entries.size();
    }

    synchronized boolean isEmpty() {
        return entries.isEmpty();
    }

    synchronized Entry<T> oldest() {
        return entries.isEmpty() ? null : entries.get(0);
    }

    synchronized List<Entry<T>> snapshot() {
        return Collections.unmodifiableList(new ArrayList<>(entries));
    }

    synchronized long maxDeadline() {
        long max = 0;
        for (Entry<T> entry : entries) max = Math.max(max, entry.deadline);
        return max;
    }

    synchronized Entry<T> removeAnswered(String session, String requestId, String command, long now) {
        String k = key(session, requestId, command);
        for (int i = 0; i < entries.size(); i++) {
            Entry<T> entry = entries.get(i);
            if (entry.key.equals(k)) {
                entries.remove(i);
                answered.computeIfAbsent(entry.session, ignored -> new ArrayDeque<>()).addLast(now);
                return entry;
            }
        }
        answered.computeIfAbsent(clean(session), ignored -> new ArrayDeque<>()).addLast(now);
        return null;
    }

    synchronized Entry<T> clearOldest(String session, long now) {
        String s = clean(session);
        ArrayDeque<Long> marks = answered.get(s);
        if (marks != null) {
            while (!marks.isEmpty() && now - marks.peekFirst() >= ANSWER_CLEAR_MS) marks.removeFirst();
            if (!marks.isEmpty()) {
                marks.removeFirst();
                if (marks.isEmpty()) answered.remove(s);
                return null;
            }
            answered.remove(s);
        }
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).session.equals(s)) return entries.remove(i);
        }
        return null;
    }

    synchronized List<Entry<T>> removeStale(long now) {
        ArrayList<Entry<T>> removed = new ArrayList<>();
        for (int i = entries.size() - 1; i >= 0; i--) {
            Entry<T> entry = entries.get(i);
            if (now > entry.deadline + STALE_MS) {
                removed.add(0, entry);
                entries.remove(i);
            }
        }
        return removed;
    }

    String requestCodeSeed(Entry<T> entry, String choice) {
        return entry.session + "|" + entry.requestId + "|" + clean(choice);
    }
}
