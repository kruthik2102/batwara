package com.batwara.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.util.Base64;
import android.view.View;

import androidx.activity.result.ActivityResult;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Native bits the web layer can't do on its own:
 *  - system bar sizes, so the iOS-style navigation bar can sit under a transparent status bar
 *  - the list of installed UPI apps, and opening one with a payment link (and reading its reply)
 *  - picking a contact's phone number without asking for the contacts permission
 */
@CapacitorPlugin(name = "BatwaraSystem")
public class BatwaraSystemPlugin extends Plugin {

    @PluginMethod
    public void insets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            float density = getContext().getResources().getDisplayMetrics().density;
            int top = 0;
            View root = getActivity().getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
            if (insets != null) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
                top = bars.top;
            }
            if (top == 0) {
                int id = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (id > 0) top = getContext().getResources().getDimensionPixelSize(id);
            }
            JSObject ret = new JSObject();
            ret.put("top", top / density);
            ret.put("bottom", 0);
            ret.put("fontScale", getContext().getResources().getConfiguration().fontScale);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void upiApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
        List<ResolveInfo> found = pm.queryIntentActivities(probe, 0);
        JSArray apps = new JSArray();
        Set<String> seen = new HashSet<>();
        for (ResolveInfo ri : found) {
            if (ri.activityInfo == null) continue;
            String pkg = ri.activityInfo.packageName;
            if (pkg == null || !seen.add(pkg)) continue;
            JSObject app = new JSObject();
            app.put("packageName", pkg);
            app.put("label", String.valueOf(ri.loadLabel(pm)));
            String icon = iconDataUrl(ri.loadIcon(pm));
            if (icon != null) app.put("icon", icon);
            apps.put(app);
        }
        JSObject ret = new JSObject();
        ret.put("apps", apps);
        call.resolve(ret);
    }

    @PluginMethod
    public void upiPay(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("upi://")) {
            call.reject("A upi:// payment link is required", "BAD_URL");
            return;
        }
        String pkg = call.getString("packageName");
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        if (pkg != null && !pkg.isEmpty()) {
            intent.setPackage(pkg);
        } else {
            intent = Intent.createChooser(intent, "Pay with");
        }
        try {
            startActivityForResult(call, intent, "upiResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No UPI app is installed on this phone", "NO_UPI_APP");
        }
    }

    @ActivityCallback
    private void upiResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("resultCode", result.getResultCode());
        String response = null;
        Intent data = result.getData();
        if (data != null) {
            response = data.getStringExtra("response");
            if (response == null) {
                // Some apps return separate extras instead of one "response" string.
                Bundle extras = data.getExtras();
                if (extras != null) {
                    StringBuilder sb = new StringBuilder();
                    for (String key : extras.keySet()) {
                        Object v = extras.get(key);
                        if (v == null) continue;
                        if (sb.length() > 0) sb.append('&');
                        sb.append(key).append('=').append(Uri.encode(String.valueOf(v)));
                    }
                    if (sb.length() > 0) response = sb.toString();
                }
            }
        }
        ret.put("response", response);
        call.resolve(ret);
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        try {
            startActivityForResult(call, intent, "contactResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No contacts app is available", "NO_CONTACTS_APP");
        }
    }

    @ActivityCallback
    private void contactResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        String[] projection = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        try (Cursor c = getContext().getContentResolver().query(data.getData(), projection, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                ret.put("cancelled", false);
                ret.put("name", c.getString(0));
                ret.put("phone", c.getString(1));
            } else {
                ret.put("cancelled", true);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Couldn't read that contact", "CONTACT_READ_FAILED", e);
        }
    }

    private String iconDataUrl(Drawable d) {
        try {
            int size = 96;
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);
            d.setBounds(0, 0, size, size);
            d.draw(canvas);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
