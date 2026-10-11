package com.omarqaterge.hermesmobile;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.DragAndDropPermissions;
import android.view.DragEvent;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Native, service-owned overlay. Every public method is marshalled to the main thread. */
final class IslandOverlay {
    enum Mood { SLEEP, THINK, WORK, ALERT, ASK, HAPPY, SAD, LEARN, DROP, LISTEN }

    static final class Approval {
        final JSONObject event;
        final String what, command;
        final long deadline;
        final boolean allowSession;

        Approval(JSONObject event, long deadline) {
            this.event = event;
            this.what = event.optString("what", event.optString("body", "A command needs approval"));
            this.command = event.optString("command", "");
            this.deadline = deadline;
            this.allowSession = event.optBoolean("allow_session", true);
        }
    }

    /** Immutable copy of the service state; the overlay never reads service fields directly. */
    static final class State {
        final boolean appVisible, working, question, learning, done, error;
        final String status, theme;
        final List<Approval> approvals;

        State(boolean appVisible, boolean working, boolean question, boolean learning, boolean done,
              boolean error, String status, String theme, List<Approval> approvals) {
            this.appVisible = appVisible;
            this.working = working;
            this.question = question;
            this.learning = learning;
            this.done = done;
            this.error = error;
            this.status = status == null ? "" : status;
            this.theme = theme == null ? "material" : theme;
            this.approvals = Collections.unmodifiableList(new ArrayList<>(approvals));
        }
    }

    private final HermesService service;
    private final WindowManager wm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final int density;
    private LinearLayout root;
    private PetView pet;
    private TextView chip;
    private State state = new State(false, false, false, false, false, false, "", "material", Collections.emptyList());
    private boolean attached, dragging, promptOpen, hiddenByLongPress;
    private long workingFinishedAt, buttonsDisabledUntil;
    private final ArrayList<Uri> droppedUris = new ArrayList<>();
    private String droppedText = "";
    private String droppedLabel = "";

    IslandOverlay(HermesService service) {
        this.service = service;
        this.wm = service.getSystemService(WindowManager.class);
        this.density = Math.max(1, Math.round(service.getResources().getDisplayMetrics().density));
    }

    void update(State next) {
        main.post(() -> {
            boolean wasWorking = state.working;
            state = next;
            if (next.working) hiddenByLongPress = false;
            if (wasWorking && !next.working) workingFinishedAt = System.currentTimeMillis();
            render();
        });
    }

    void settingsChanged() { main.post(this::render); }

    void trigger() {
        main.post(() -> {
            hiddenByLongPress = false;
            workingFinishedAt = System.currentTimeMillis() + 4000;
            render();
        });
    }

    void destroy() {
        main.removeCallbacksAndMessages(null);
        if (attached) {
            try { wm.removeView(root); } catch (Exception ignored) {}
            attached = false;
        }
    }

    private boolean enabled() {
        return service.getSharedPreferences("hm", Context.MODE_PRIVATE).getBoolean("island_enabled", false)
                && Settings.canDrawOverlays(service);
    }

    private boolean always() {
        return "always".equals(service.getSharedPreferences("hm", Context.MODE_PRIVATE)
                .getString("island_visibility", "demand"));
    }

    private boolean active() {
        long now = System.currentTimeMillis();
        return dragging || promptOpen || state.working || state.question || !state.approvals.isEmpty()
                || state.learning || state.done || state.error || workingFinishedAt > now;
    }

    private void render() {
        if (!enabled() || state.appVisible) {
            detach();
            return;
        }
        ensureView();
        boolean show = always() ? !hiddenByLongPress || active() : active();
        if (!show) {
            showDropStrip();
            return;
        }
        showIsland();
        long next = nextExpiry();
        if (next > 0) main.postDelayed(this::render, Math.max(50, next - System.currentTimeMillis() + 50));
    }

    private long nextExpiry() {
        long now = System.currentTimeMillis(), next = 0;
        long[] times = {workingFinishedAt, buttonsDisabledUntil};
        for (long t : times) if (t > now && (next == 0 || t < next)) next = t;
        return next;
    }

    private void ensureView() {
        if (root != null) return;
        root = new LinearLayout(service);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(10), dp(7), dp(10), dp(8));
        root.setOnDragListener(this::onDrag);
        root.setFocusableInTouchMode(true);
        root.setOnKeyListener((v, code, event) -> {
            if (code == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP && promptOpen) {
                closePrompt();
                return true;
            }
            return false;
        });
        pet = new PetView(service);
        pet.setOnLongClickListener(v -> {
            if (!active() && pet.mood == Mood.SLEEP) {
                hiddenByLongPress = true;
                render();
                return true;
            }
            return false;
        });
        chip = label("", 12, true);
        root.addView(pet, new LinearLayout.LayoutParams(dp(68), dp(56)));
        root.addView(chip, wrap());
    }

    private void attach(int width, int height, boolean focusable) {
        int flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        if (!focusable) flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(width, height,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags,
                android.graphics.PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(8);
        if (!attached) {
            try { wm.addView(root, lp); attached = true; } catch (Exception ignored) {}
        } else {
            try { wm.updateViewLayout(root, lp); } catch (Exception ignored) {}
        }
    }

    private void detach() {
        if (!attached) return;
        try { wm.removeView(root); } catch (Exception ignored) {}
        attached = false;
    }

    private void resetChildren() {
        root.removeAllViews();
        root.addView(pet, new LinearLayout.LayoutParams(dp(68), dp(56)));
        root.addView(chip, wrap());
    }

    private void showDropStrip() {
        promptOpen = false;
        dragging = false;
        root.removeAllViews();
        root.setPadding(0, 0, 0, 0);
        root.setBackgroundColor(Color.TRANSPARENT);
        attach(dp(120), dp(20), false);
    }

    private void showIsland() {
        root.setPadding(dp(10), dp(7), dp(10), dp(8));
        applyFrame();
        if (promptOpen) {
            showPrompt();
            return;
        }
        resetChildren();
        if (dragging) {
            pet.setMood(Mood.DROP);
            chip.setVisibility(View.VISIBLE);
            chip.setText("Drop to ask Hermes");
            attach(dp(250), dp(64), false);
            return;
        }
        Mood mood = mood();
        pet.setMood(mood);
        chip.setVisibility(View.GONE); // working state is deliberately pet-only; the Android Live Update carries text
        if (!state.approvals.isEmpty()) addApproval(state.approvals.get(0));
        attach(dp(state.approvals.isEmpty() ? 124 : 300), ViewGroup.LayoutParams.WRAP_CONTENT, false);
    }

    private Mood mood() {
        if (!state.approvals.isEmpty()) return Mood.ALERT;
        if (state.question) return Mood.ASK;
        if (state.done) return Mood.HAPPY;
        if (state.learning) return Mood.LEARN;
        if (state.error) return Mood.SAD;
        if (state.working) {
            String s = state.status.toLowerCase(java.util.Locale.ROOT);
            return s.startsWith("thinking") || s.startsWith("working") || s.startsWith("learning")
                    ? Mood.THINK : Mood.WORK;
        }
        return Mood.SLEEP;
    }

    private String chipText(Mood mood) {
        switch (mood) {
            case ALERT:
                long sec = Math.max(0, (state.approvals.get(0).deadline - System.currentTimeMillis() + 999) / 1000);
                return sec > 0 ? "🙀 " + sec + "s" : "🙀 wait";
            case ASK: return "🐱❓";
            case HAPPY: return "😸";
            case SAD: return "😿";
            case THINK: return "🐱💭";
            case WORK: return "🐱🔧";
            case LEARN: return "🐱💡";
            default: return "🐱";
        }
    }

    private void addApproval(Approval a) {
        TextView detail = label((a.what.isEmpty() ? "Approval needed" : a.what)
                + (a.command.isEmpty() ? "" : "\n$ " + a.command), 12, false);
        detail.setTypeface(Typeface.MONOSPACE);
        detail.setMaxLines(3);
        detail.setEllipsize(android.text.TextUtils.TruncateAt.END);
        root.addView(detail, matchWrap());
        LinearLayout buttons = new LinearLayout(service);
        buttons.setGravity(Gravity.CENTER);
        addApprovalButton(buttons, "Allow once", a, "once");
        if (a.allowSession) addApprovalButton(buttons, "Session", a, "session");
        addApprovalButton(buttons, "Deny", a, "deny");
        root.addView(buttons, matchWrap());
        long sec = Math.max(0, (a.deadline - System.currentTimeMillis() + 999) / 1000);
        String foot = sec > 0 ? sec + "s" : "still waiting";
        if (state.approvals.size() > 1) foot += "   +" + (state.approvals.size() - 1) + " more waiting";
        root.addView(label(foot, 11, false), wrap());
        main.postDelayed(this::render, 1000);
    }

    private void addApprovalButton(LinearLayout row, String title, Approval approval, String choice) {
        Button b = new Button(service);
        b.setText(title);
        b.setTextSize(11);
        b.setMinHeight(0);
        b.setMinWidth(0);
        b.setPadding(dp(7), dp(2), dp(7), dp(2));
        boolean disabled = System.currentTimeMillis() < buttonsDisabledUntil;
        b.setEnabled(!disabled);
        b.setAlpha(disabled ? 0.4f : 1f);
        b.setOnClickListener(v -> {
            buttonsDisabledUntil = System.currentTimeMillis() + 4000;
            service.answerApproval(approval.event, choice);
            render();
        });
        row.addView(b, wrap());
    }

    private boolean onDrag(View view, DragEvent event) {
        switch (event.getAction()) {
            case DragEvent.ACTION_DRAG_STARTED:
                ClipData started = event.getClipData();
                if (started == null || !hasUsableItem(started)) return false;
                dragging = true;
                render();
                return true;
            case DragEvent.ACTION_DRAG_ENTERED:
                dragging = true;
                render();
                return true;
            case DragEvent.ACTION_DROP:
                dragging = false;
                copyDrop(event);
                return true;
            case DragEvent.ACTION_DRAG_ENDED:
                if (!promptOpen) { dragging = false; render(); }
                return true;
            default:
                return true;
        }
    }

    private boolean hasUsableItem(ClipData data) {
        for (int i = 0; i < data.getItemCount(); i++) {
            ClipData.Item item = data.getItemAt(i);
            if (item.getUri() != null || item.getText() != null) return true;
        }
        return false;
    }

    private void copyDrop(DragEvent event) {
        final ClipData clip = event.getClipData();
        final DragAndDropPermissions permission;
        MainActivity activity = MainActivity.current;
        try { permission = activity == null ? null : activity.requestDragAndDropPermissions(event); }
        catch (Exception e) { renderReadFailure(); return; }
        new Thread(() -> {
            ArrayList<Uri> files = new ArrayList<>();
            StringBuilder text = new StringBuilder();
            String label = "";
            try {
                File dir = new File(service.getCacheDir(), "island");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                long cutoff = System.currentTimeMillis() - 3600_000L;
                if (old != null) for (File f : old) if (f.lastModified() < cutoff) f.delete();
                for (int i = 0; i < clip.getItemCount() && files.size() < 5; i++) {
                    ClipData.Item item = clip.getItemAt(i);
                    if (item.getUri() != null) {
                        Uri uri = item.getUri();
                        String name = displayName(uri, i);
                        File out = uniqueFile(dir, name);
                        if (copyLimited(uri, out, 20L * 1024 * 1024)) {
                            files.add(Uri.fromFile(out));
                            if (label.isEmpty()) label = name;
                        } else out.delete();
                    }
                    CharSequence cs = item.getText();
                    if (cs != null && cs.length() > 0) {
                        if (text.length() > 0) text.append('\n');
                        int left = 100_000 - text.length();
                        if (left > 0) text.append(cs, 0, Math.min(left, cs.length()));
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (permission != null) permission.release();
            }
            final String copiedText = text.toString();
            final String copiedLabel = label;
            main.post(() -> {
                droppedUris.clear();
                droppedUris.addAll(files);
                droppedText = copiedText;
                droppedLabel = copiedLabel;
                if (files.isEmpty() && copiedText.trim().isEmpty()) renderReadFailure();
                else { promptOpen = true; render(); }
            });
        }, "hermes-island-copy").start();
    }

    private void renderReadFailure() {
        droppedUris.clear();
        droppedText = "";
        promptOpen = true;
        droppedLabel = "Couldn't read that. Share it to Hermes instead.";
        render();
    }

    private void showPrompt() {
        root.removeAllViews();
        pet.setMood(Mood.DROP);
        root.addView(pet, new LinearLayout.LayoutParams(dp(58), dp(48)));
        if (!droppedUris.isEmpty()) {
            Bitmap thumb = decodeThumb(droppedUris.get(0));
            if (thumb != null) {
                ImageView image = new ImageView(service);
                image.setImageBitmap(thumb);
                image.setScaleType(ImageView.ScaleType.CENTER_CROP);
                root.addView(image, new LinearLayout.LayoutParams(dp(160), dp(100)));
            }
        }
        String preview = !droppedLabel.isEmpty() ? droppedLabel : droppedText.trim();
        if (preview.length() > 180) preview = preview.substring(0, 180) + "…";
        root.addView(label(preview, 12, false), matchWrap());
        LinearLayout chips = new LinearLayout(service);
        chips.setGravity(Gravity.CENTER);
        EditText input = new EditText(service);
        input.setHint("Ask Hermes…");
        input.setSingleLine(false);
        addFillButton(chips, "Describe it", input);
        addFillButton(chips, "Extract text", input);
        addFillButton(chips, "Summarize", input);
        root.addView(chips, matchWrap());
        root.addView(input, new LinearLayout.LayoutParams(dp(270), ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout actions = new LinearLayout(service);
        actions.setGravity(Gravity.END);
        Button cancel = new Button(service);
        cancel.setText("Cancel");
        cancel.setOnClickListener(v -> closePrompt());
        Button send = new Button(service);
        send.setText("Send");
        send.setOnClickListener(v -> {
            String typed = input.getText().toString().trim();
            if (typed.isEmpty()) return;
            String prompt = typed + (droppedText.trim().isEmpty() ? "" : "\n\n" + droppedText.trim());
            ArrayList<Uri> copy = new ArrayList<>(droppedUris);
            closePrompt();
            service.islandSubmit(prompt, copy);
        });
        actions.addView(cancel, wrap());
        actions.addView(send, wrap());
        root.addView(actions, matchWrap());
        attach(dp(310), ViewGroup.LayoutParams.WRAP_CONTENT, true);
        root.requestFocus();
        input.requestFocus();
        main.postDelayed(() -> ((InputMethodManager) service.getSystemService(Context.INPUT_METHOD_SERVICE))
                .showSoftInput(input, InputMethodManager.SHOW_IMPLICIT), 120);
    }

    private void addFillButton(LinearLayout row, String text, EditText input) {
        Button b = new Button(service);
        b.setText(text);
        b.setTextSize(10);
        b.setMinWidth(0);
        b.setPadding(dp(5), 0, dp(5), 0);
        b.setOnClickListener(v -> input.setText(text));
        row.addView(b, wrap());
    }

    private void closePrompt() {
        promptOpen = false;
        droppedUris.clear();
        droppedText = "";
        droppedLabel = "";
        ((InputMethodManager) service.getSystemService(Context.INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(root.getWindowToken(), 0);
        render();
    }

    private String displayName(Uri uri, int index) {
        String name = null;
        try (android.database.Cursor c = service.getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int at = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (at >= 0) name = c.getString(at);
            }
        } catch (Exception ignored) {}
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.trim().isEmpty()) name = "drop-" + (index + 1);
        name = name.replaceAll("[/\\\\\\x00-\\x1f]", "_");
        return name.length() > 100 ? name.substring(name.length() - 100) : name;
    }

    private File uniqueFile(File dir, String name) {
        File f = new File(dir, System.currentTimeMillis() + "-" + name);
        int n = 1;
        while (f.exists()) f = new File(dir, System.currentTimeMillis() + "-" + n++ + "-" + name);
        return f;
    }

    private boolean copyLimited(Uri uri, File out, long max) {
        try (InputStream in = service.getContentResolver().openInputStream(uri);
             FileOutputStream dest = new FileOutputStream(out)) {
            if (in == null) return false;
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > max) return false;
                dest.write(buf, 0, n);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Bitmap decodeThumb(Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = service.getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, bounds);
            }
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > 320) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            try (InputStream in = service.getContentResolver().openInputStream(uri)) {
                return BitmapFactory.decodeStream(in, null, opts);
            }
        } catch (Exception e) {
            return null;
        }
    }

    private void applyFrame() {
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        if ("neo".equals(state.theme)) {
            bg.setColor(Color.rgb(255, 246, 229));
            bg.setStroke(dp(3), Color.BLACK);
            bg.setCornerRadius(dp(4));
            root.setElevation(dp(8));
        } else if ("glass".equals(state.theme)) {
            bg.setColor(0xCCFFFFFF);
            bg.setStroke(dp(1), 0xAAFFFFFF);
            bg.setCornerRadius(dp(18));
            root.setElevation(dp(8));
        } else {
            bg.setColor(0xF2222028);
            bg.setStroke(dp(1), 0x446750A4);
            bg.setCornerRadius(dp(24));
            root.setElevation(dp(6));
        }
        root.setBackground(bg);
    }

    private TextView label(String text, int sp, boolean bold) {
        TextView v = new TextView(service);
        v.setText(text);
        v.setTextColor(Color.WHITE);
        v.setTextSize(sp);
        v.setGravity(Gravity.CENTER);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        return v;
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) { return value * density; }

    /** Canvas-only cat; frame rate is 25 fps except the idle sleep animation. */
    static final class PetView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private Mood mood = Mood.SLEEP;
        private long start = System.currentTimeMillis();

        PetView(Context context) { super(context); setLongClickable(true); }

        void setMood(Mood mood) {
            if (this.mood != mood) { this.mood = mood; start = System.currentTimeMillis(); }
            invalidate();
        }

        @Override protected void onDraw(Canvas c) {
            super.onDraw(c);
            float w = getWidth(), h = getHeight();
            float phase = (System.currentTimeMillis() - start) / 160f;
            float dx = mood == Mood.ALERT ? (float) Math.sin(phase * 3) * w * .025f : 0;
            float dy = mood == Mood.WORK ? (float) Math.sin(phase) * h * .035f : 0;
            c.save();
            c.translate(dx, dy);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFFFFC75A);
            path.reset();
            path.moveTo(w * .18f, h * .32f); path.lineTo(w * .27f, h * .06f); path.lineTo(w * .40f, h * .25f);
            path.lineTo(w * .60f, h * .25f); path.lineTo(w * .73f, h * .06f); path.lineTo(w * .82f, h * .32f);
            path.close(); c.drawPath(path, p);
            c.drawOval(w * .16f, h * .18f, w * .84f, h * .92f, p);
            p.setColor(Color.rgb(40, 35, 45));
            p.setStrokeWidth(Math.max(2, w * .035f));
            p.setStyle(Paint.Style.STROKE);
            if (mood == Mood.SLEEP || mood == Mood.HAPPY) {
                c.drawArc(w * .29f, h * .43f, w * .43f, h * .57f, 10, 160, false, p);
                c.drawArc(w * .57f, h * .43f, w * .71f, h * .57f, 10, 160, false, p);
            } else {
                p.setStyle(Paint.Style.FILL);
                float ey = mood == Mood.THINK ? h * .44f : h * .50f;
                float er = mood == Mood.ALERT ? w * .055f : w * .035f;
                c.drawCircle(w * .36f, ey, er, p); c.drawCircle(w * .64f, ey, er, p);
            }
            p.setStyle(Paint.Style.STROKE);
            if (mood == Mood.DROP) c.drawOval(w * .42f, h * .64f, w * .58f, h * .82f, p);
            else if (mood == Mood.SAD) c.drawArc(w * .40f, h * .70f, w * .60f, h * .84f, 200, 140, false, p);
            else c.drawArc(w * .41f, h * .60f, w * .59f, h * .77f, 20, 140, false, p);
            p.setStyle(Paint.Style.FILL);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTypeface(Typeface.DEFAULT_BOLD);
            p.setTextSize(w * .22f);
            if (mood == Mood.ALERT) { p.setColor(0xFFE53935); c.drawText("!", w * .87f, h * .25f, p); }
            if (mood == Mood.ASK) { p.setColor(0xFFFFC107); c.drawText("?", w * .87f, h * .25f, p); }
            if (mood == Mood.LEARN) { p.setColor(0xFFFFEB3B); c.drawText("☀", w * .86f, h * .25f, p); }
            if (mood == Mood.THINK) { p.setColor(Color.WHITE); c.drawText("···", w * .84f, h * .24f, p); }
            if (mood == Mood.SLEEP) { p.setColor(Color.WHITE); c.drawText("z", w * .84f, h * .24f, p); }
            if (mood == Mood.SAD) { p.setColor(0xFF42A5F5); c.drawCircle(w * .68f, h * .64f, w * .025f, p); }
            if (mood == Mood.HAPPY) { p.setColor(Color.WHITE); c.drawText("✦", w * .86f, h * .28f, p); }
            if (mood == Mood.WORK) {
                c.save(); c.rotate(phase * 24, w * .84f, h * .24f); p.setColor(Color.WHITE); c.drawText("✦", w * .84f, h * .29f, p); c.restore();
            }
            c.restore();
            postInvalidateDelayed(mood == Mood.SLEEP ? 240 : 40);
        }
    }
}
