package com.zukait.timetrack;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {
    private static final int MIC_REQUEST = 1001;
    private static final int NOTIFICATION_REQUEST = 1002;
    private static final String NOTIFICATION_CHANNEL = "zukait_updates";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private long updateDownloadId = -1;
    private BroadcastReceiver updateReceiver;
    private SpeechRecognizer speechRecognizer;
    private boolean pendingNativeVoice = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        createNotificationChannel();
        registerUpdateReceiver();

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        }

        webView = new WebView(this);
        setContentView(webView);
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return uri == null || !APP_HOST.equalsIgnoreCase(uri.getHost());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                try {
                    Uri uri = Uri.parse(url);
                    return !APP_HOST.equalsIgnoreCase(uri.getHost());
                } catch (Exception e) {
                    return true;
                }
            }
        });

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            wantsAudio = true;
                            break;
                        }
                    }

                    if (!wantsAudio) {
                        request.deny();
                        return;
                    }

                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingPermissionRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                    }
                });
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl("https://" + APP_HOST + "/assets/offline_test.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL,
                    "Zukait Time Track",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Job assignments, requests and workshop time alerts");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void notify(String title, String message) {
            runOnUiThread(() -> showNotification(title, message));
        }

        @JavascriptInterface
        public boolean hasMicrophonePermission() {
            return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "V70";
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            return 33;
        }

        @JavascriptInterface
        public void checkForUpdates() {
            checkForUpdatesNative();
        }

        @JavascriptInterface
        public void openUpdatePage() {
            runOnUiThread(() -> downloadAndInstallUpdate());
        }

        @JavascriptInterface
        public void startNativeVoiceRecognition() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingNativeVoice = true;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                    return;
                }
                startNativeVoiceRecognitionInternal();
            });
        }

        @JavascriptInterface
        public void requestMicrophonePermission() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    notifyMicrophonePermissionToWeb(true);
                } else {
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                }
            });
        }
    }

    private void startNativeVoiceRecognitionInternal() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            notifyVoiceResultToWeb("", "Voice recognition service is not available on this phone.");
            return;
        }

        try {
            if (speechRecognizer != null) {
                speechRecognizer.destroy();
                speechRecognizer = null;
            }
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { }

                @Override public void onError(int error) {
                    String message;
                    switch (error) {
                        case SpeechRecognizer.ERROR_AUDIO:
                            message = "Microphone audio error. Please try again."; break;
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                            message = "Microphone permission is not available to the app."; break;
                        case SpeechRecognizer.ERROR_NETWORK:
                        case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                            message = "Voice recognition needs a working network connection."; break;
                        case SpeechRecognizer.ERROR_NO_MATCH:
                            message = "No speech was recognized. Please try again."; break;
                        case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                            message = "Voice recognition is busy. Please try again."; break;
                        case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                            message = "No speech detected. Please try again."; break;
                        default:
                            message = "Voice recognition could not start. Please try again."; break;
                    }
                    notifyVoiceResultToWeb("", message);
                }

                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                    notifyVoiceResultToWeb(text, text.isEmpty() ? "No speech was recognized. Please try again." : "");
                }

                @Override public void onPartialResults(Bundle partialResults) { }
                @Override public void onEvent(int eventType, Bundle params) { }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your message");
            speechRecognizer.startListening(intent);
        } catch (Exception e) {
            notifyVoiceResultToWeb("", "Voice recognition could not start. Please try again.");
        }
    }

    private void notifyVoiceResultToWeb(String text, String error) {
        if (webView == null) return;
        final String safeText = JSONObject.quote(text == null ? "" : text);
        final String safeError = JSONObject.quote(error == null ? "" : error);
        webView.post(() -> webView.evaluateJavascript(
                "if(window.v69OnVoiceResult){window.v69OnVoiceResult(" + safeText + "," + safeError + ");}",
                null
        ));
    }

    private void checkForUpdatesNative() {
        new Thread(() -> {
            int latestCode = 0;
            String latestName = "";
            boolean error = false;
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://raw.githubusercontent.com/zukaitauto/zukait-time-track-android/main/latest-version.json");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("Cache-Control", "no-cache");
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    JSONObject json = new JSONObject(sb.toString());
                    latestCode = json.optInt("versionCode", 0);
                    latestName = json.optString("versionName", "");
                    if (latestCode <= 0) error = true;
                }
            } catch (Exception ex) {
                error = true;
            } finally {
                if (conn != null) conn.disconnect();
            }
            final int code = latestCode;
            final String name = latestName;
            final boolean failed = error;
            runOnUiThread(() -> {
                if (webView == null) return;
                String safeName = name.replace("\\", "\\\\").replace("'", "\\'");
                webView.evaluateJavascript(
                        "if(window.v69UpdateCheckResult){window.v69UpdateCheckResult(" + code + ",'" + safeName + "'," + (failed ? "true" : "false") + ");}",
                        null
                );
            });
        }).start();
    }

    private void registerUpdateReceiver() {
        updateReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != updateDownloadId) return;
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                Uri apk = dm != null ? dm.getUriForDownloadedFile(id) : null;
                if (apk == null) return;
                try {
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(apk, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(install);
                } catch (Exception ignored) { }
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(updateReceiver, filter);
    }

    private void downloadAndInstallUpdate() {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm == null) return;
            Uri uri = Uri.parse("https://github.com/zukaitauto/zukait-time-track-android/releases/latest/download/ZUKAIT_TIME_TRACK_LATEST.apk");
            DownloadManager.Request req = new DownloadManager.Request(uri)
                    .setTitle("Zukait Time Track Update")
                    .setDescription("Preparing update")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            updateDownloadId = dm.enqueue(req);
        } catch (Exception ignored) { }
    }

    private void notifyMicrophonePermissionToWeb(boolean granted) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "if(window.v55OnMicrophonePermission){window.v55OnMicrophonePermission(" + (granted ? "true" : "false") + ");}",
                null
        ));
    }

    private void showNotification(String title, String message) {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new Notification.Builder(this);

        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle((title == null || title.isEmpty()) ? "Zukait Time Track" : title)
                .setContentText(message == null ? "" : message)
                .setStyle(new Notification.BigTextStyle().bigText(message == null ? "" : message))
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH);

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify((int) (System.currentTimeMillis() & 0x0fffffff), builder.build());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_REQUEST) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingPermissionRequest != null) {
                if (granted) {
                    pendingPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingPermissionRequest.deny();
                }
                pendingPermissionRequest = null;
            }
            notifyMicrophonePermissionToWeb(granted);
            if (pendingNativeVoice) {
                pendingNativeVoice = false;
                if (granted) startNativeVoiceRecognitionInternal();
                else notifyVoiceResultToWeb("", "Microphone permission is disabled for Zukait Time Track.");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (updateReceiver != null) { try { unregisterReceiver(updateReceiver); } catch (Exception ignored) { } }
        if (speechRecognizer != null) { try { speechRecognizer.destroy(); } catch (Exception ignored) { } speechRecognizer = null; }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
