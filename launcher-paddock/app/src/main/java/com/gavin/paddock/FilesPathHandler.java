package com.gavin.paddock;

import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

// Serves files/paddock/ (config, garage, photos) from app-specific EXTERNAL storage.
// WebViewAssetLoader's own InternalStoragePathHandler refuses anything outside its internal-
// storage allowlist (getFilesDir()/getCacheDir()/etc) and throws on external storage, so this
// reads the bytes directly instead - same approach as IconPathHandler, and the directory is
// still only ever this app's own app-specific folder, nothing path-traversable out of it.
class FilesPathHandler implements WebViewAssetLoader.PathHandler {
    private final File root;

    FilesPathHandler(File root) {
        this.root = root;
    }

    @Override
    public WebResourceResponse handle(String path) {
        if (path.contains("..")) return null;
        File file = new File(root, path);
        if (!file.exists() || !file.isFile()) return null;
        try {
            boolean isJson = path.endsWith(".json");
            String mime = isJson ? "application/json"
                    : (path.endsWith(".jpg") || path.endsWith(".jpeg")) ? "image/jpeg"
                    : "application/octet-stream";
            return new WebResourceResponse(mime, isJson ? "utf-8" : null, new FileInputStream(file));
        } catch (IOException e) {
            return null;
        }
    }
}
