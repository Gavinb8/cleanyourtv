package com.gavin.paddock;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.List;

// SPEC.md section 4.3: the one object the WebView side talks to. Everything here is local -
// no network calls, nothing leaves the device.
public class PaddockBridge {
    private static final String TAG = "Paddock";
    private static final String PREFS = "paddock_storage";

    private final Context context;

    PaddockBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String getApps() {
        PackageManager pm = context.getPackageManager();
        List<ResolveInfo> apps = pm.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER), 0);
        JSONArray out = new JSONArray();
        try {
            for (ResolveInfo ri : apps) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(context.getPackageName())) continue; // never list Paddock itself
                JSONObject o = new JSONObject();
                o.put("pkg", pkg);
                o.put("label", String.valueOf(ri.loadLabel(pm)));
                out.put(o);
            }
        } catch (JSONException e) {
            Log.e(TAG, "getApps", e);
        }
        return out.toString();
    }

    @JavascriptInterface
    public boolean launch(String pkg) {
        PackageManager pm = context.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) {
            Log.w(TAG, "launch: no launch intent for " + pkg);
            return false;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(i);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "launch failed for " + pkg, e);
            return false;
        }
    }

    @JavascriptInterface
    public void openSettings(String section) {
        String action = "network".equals(section)
                ? Settings.ACTION_WIFI_SETTINGS
                : Settings.ACTION_SETTINGS;
        Intent i = new Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(i);
        } catch (Exception e) {
            Log.e(TAG, "openSettings failed", e);
        }
    }

    @JavascriptInterface
    public String getNetwork() {
        ConnectivityManager cm = context.getSystemService(ConnectivityManager.class);
        String type = "none";
        boolean connected = false;
        if (cm != null) {
            Network net = cm.getActiveNetwork();
            NetworkCapabilities caps = net != null ? cm.getNetworkCapabilities(net) : null;
            if (caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                connected = true;
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) type = "eth";
                else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "wifi";
            }
        }
        JSONObject o = new JSONObject();
        try {
            o.put("type", type);
            o.put("connected", connected);
        } catch (JSONException e) { /* unreachable: both keys are always valid */ }
        return o.toString();
    }

    @JavascriptInterface
    public long getInstallTime() {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).firstInstallTime;
        } catch (Exception e) {
            return System.currentTimeMillis();
        }
    }

    @JavascriptInterface
    public String storageGet(String key) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(key, "");
    }

    @JavascriptInterface
    public void storageSet(String key, String value) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, value).apply();
    }

    @JavascriptInterface
    public void log(String msg) {
        Log.d(TAG, msg);
    }
}
