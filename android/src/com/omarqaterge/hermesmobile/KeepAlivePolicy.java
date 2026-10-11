package com.omarqaterge.hermesmobile;

/** Timing policy for keeping the hidden WebView alive; Android lifecycle code applies the result. */
final class KeepAlivePolicy {
    private KeepAlivePolicy() {}

    static long nextDelay(long now, long hiddenAt, long holdUntil,
                          boolean serviceNeedsPage, boolean pageHeldVisible) {
        if (now >= holdUntil && !serviceNeedsPage) return -1;
        if (!pageHeldVisible && now < hiddenAt + 800) return hiddenAt + 800 - now;
        return pageHeldVisible ? 15_000 : 0;
    }
}
