package com.gavin.paddock;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

// SPEC.md 4.1: one Activity, singleTask, HOME + LEANBACK_LAUNCHER. The UI is a local-only
// WebView; this class owns every key press and forwards it to JS rather than letting the
// WebView take focus traversal (4.2).
public class MainActivity extends Activity {

    private WebView webView;
    private long okDownAt = 0;
    private boolean okHoldFired = false;
    private static final int HOLD_MS = 500;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#0B0C0D"));

        seedFilesFromAssetsIfMissing();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0B0C0D"));
        webView.setFocusable(false); // this Activity owns every key, not the WebView
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // SPEC.md rule 4: no network in the launcher. shouldInterceptRequest below also
        // refuses anything outside the three handlers as a second, independent guard.
        settings.setBlockNetworkLoads(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // App-specific EXTERNAL storage, not getFilesDir(): writable by plain `adb push`/`adb shell`
        // with no run-as and no special permission (it's scoped per-app on modern Android), matching
        // the repo's own tools/theme.sh convention for pushing live launcher config over ADB.
        File filesRoot = new File(getExternalFilesDir(null), "paddock");
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/files/paddock/", new FilesPathHandler(filesRoot))
                .addPathHandler("/icon/", new IconPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.addJavascriptInterface(new PaddockBridge(this), "Paddock");
        webView.loadUrl("https://appassets.androidplatform.net/assets/preview/index.html");
    }

    /** First run only: give the WebView something real to show before any push script has run. */
    private void seedFilesFromAssetsIfMissing() {
        File dest = new File(getExternalFilesDir(null), "paddock");
        if (new File(dest, "paddock.config.json").exists()) return;
        dest.mkdirs();
        copyAssetDir("preview/files/paddock", dest);
    }

    private void copyAssetDir(String assetPath, File destDir) {
        try {
            String[] entries = getAssets().list(assetPath);
            if (entries == null) return;
            for (String name : entries) {
                String childAsset = assetPath + "/" + name;
                File childDest = new File(destDir, name);
                String[] grandchildren = getAssets().list(childAsset);
                if (grandchildren != null && grandchildren.length > 0) {
                    childDest.mkdirs();
                    copyAssetDir(childAsset, childDest);
                } else {
                    try (InputStream in = getAssets().open(childAsset);
                         FileOutputStream out = new FileOutputStream(childDest)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.e("Paddock", "seedFilesFromAssetsIfMissing", e);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = mapKey(event.getKeyCode());
        if (key == null) return super.dispatchKeyEvent(event); // volume, power, etc. go to the system

        boolean isOk = "ok".equals(key);
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (isOk) {
                if (event.getRepeatCount() == 0) { okDownAt = System.currentTimeMillis(); okHoldFired = false; }
                else if (!okHoldFired && System.currentTimeMillis() - okDownAt >= HOLD_MS) {
                    okHoldFired = true;
                    sendKey("okHold");
                }
            } else if (event.getRepeatCount() == 0) {
                // Bug found 2026-10-24: this used to fire on every repeat a held button sends,
                // so holding Down even briefly cascaded through N->D->S in one motion ("glitches
                // out" - Gavin). Each physical press is one discrete move; a held key repeating
                // isn't a gesture any mode here understands, so ignore the repeats entirely.
                sendKey(key);
            }
            return true;
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            if (isOk && !okHoldFired) sendKey("ok");
            return true;
        }
        return true; // consume everything else about this key (e.g. ACTION_MULTIPLE)
    }

    private void sendKey(String name) {
        webView.evaluateJavascript("window.paddock && window.paddock.onKey('" + name + "')", null);
    }

    private static String mapKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP: return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                return "ok";
            case KeyEvent.KEYCODE_BACK: return "back";
            default: return null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getCategories() != null && intent.getCategories().contains(Intent.CATEGORY_HOME)) {
            webView.evaluateJavascript("window.paddock && window.paddock.onHome && window.paddock.onHome()", null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.evaluateJavascript("window.paddock && window.paddock.onLifecycle('pause')", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.evaluateJavascript("window.paddock && window.paddock.onLifecycle('resume')", null);
    }

    @Override
    public void onBackPressed() {
        // DESIGN.md key map: Back in N does nothing (swallow it) - never fall through to a
        // chooser or exit the launcher. JS already handles Back per-mode; the Activity itself
        // must never finish() or launch anything else on its own.
    }
}
