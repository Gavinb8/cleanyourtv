package com.gavin.paddock;

import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.BitmapDrawable;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

// Serves https://appassets.androidplatform.net/icon/<pkg>.png by streaming that app's own
// installed banner (TV apps' wide artwork) or, failing that, its icon - never a base64 blob
// in JS, never anything bundled or drawn by Paddock itself (SPEC.md 4.3).
class IconPathHandler implements WebViewAssetLoader.PathHandler {
    private final Context context;

    IconPathHandler(Context context) {
        this.context = context.getApplicationContext();
    }

    @Override
    public WebResourceResponse handle(String path) {
        // path is like "icon/com.netflix.ninja.png"
        String pkg = path.replace(".png", "");
        PackageManager pm = context.getPackageManager();
        Drawable d = null;
        try {
            d = pm.getApplicationBanner(pkg);
        } catch (PackageManager.NameNotFoundException ignored) { /* fall through to icon */ }
        if (d == null) {
            try {
                d = pm.getApplicationIcon(pkg);
            } catch (PackageManager.NameNotFoundException e) {
                return null; // app.js falls back to its own letter-square mock icon on a 404
            }
        }
        Bitmap bmp = drawableToBitmap(d);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return new WebResourceResponse("image/png", null, new ByteArrayInputStream(out.toByteArray()));
    }

    private static Bitmap drawableToBitmap(Drawable d) {
        if (d instanceof BitmapDrawable) return ((BitmapDrawable) d).getBitmap();
        int w = Math.max(1, d.getIntrinsicWidth());
        int h = Math.max(1, d.getIntrinsicHeight());
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(bmp);
        d.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        d.draw(canvas);
        return bmp;
    }
}
