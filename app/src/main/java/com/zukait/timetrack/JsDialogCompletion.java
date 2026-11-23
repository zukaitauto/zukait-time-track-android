package com.zukait.timetrack;

/** Exactly-once completion for custom WebView dialog results. */
final class JsDialogCompletion {
    private boolean finished;
    synchronized void finish(Runnable response) {
        if (finished) return;
        finished = true;
        response.run();
    }
}
