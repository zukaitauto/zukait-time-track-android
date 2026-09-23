package com.zukait.timetrack;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.media.MediaRecorder;
import android.util.Base64;
import android.provider.MediaStore;
import android.content.ContentValues;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.print.PrintManager;
import android.print.PrintDocumentAdapter;
import android.print.PrintAttributes;
import android.print.PageRange;
import android.os.ParcelFileDescriptor;
import android.os.CancellationSignal;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.JsPromptResult;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.EditText;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {
    private static final int EXPORT_FILE_REQUEST = 7401;
    private byte[] pendingExportData = null;
    private static final int MIC_REQUEST = 1001;
    private static final int NOTIFICATION_REQUEST = 1002;
    private static final int UNKNOWN_SOURCES_REQUEST = 1003;
    private static final int UPDATE_INSTALL_REQUEST = 1004;
    private static final String NOTIFICATION_CHANNEL = "zukait_updates";
    private static final String APP_HOST = "appassets.androidplatform.net";
    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private long updateDownloadId = -1;
    private int updateTargetVersionCode = 0;
    private boolean updateEnqueueInProgress = false;
    private boolean pendingInstallAfterPermission = false;
    private final android.os.Handler updateHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable updateProgressRunnable;
    private BroadcastReceiver updateReceiver;
    private SpeechRecognizer speechRecognizer;
    private boolean pendingNativeVoice = false;
    private boolean pendingNativeVoiceNote = false;
    private MediaRecorder voiceNoteRecorder;
    private File voiceNoteFile;

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
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
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
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                runOnUiThread(() -> {
                    String text = message == null ? "" : message;
                    if (text.startsWith("Request sent to Supervisor") || text.startsWith("Request sent")) {
                        android.widget.Toast.makeText(MainActivity.this, text, android.widget.Toast.LENGTH_LONG).show();
                        result.confirm();
                        return;
                    }
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Zukait Time Track")
                            .setMessage(text)
                            .setPositiveButton("OK", (dialog, which) -> result.confirm())
                            .setOnCancelListener(dialog -> result.cancel())
                            .show();
                });
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Zukait Time Track")
                        .setMessage(message == null ? "" : message)
                        .setPositiveButton("OK", (dialog, which) -> result.confirm())
                        .setNegativeButton("Cancel", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show());
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                runOnUiThread(() -> {
                    final EditText input = new EditText(MainActivity.this);
                    input.setText(defaultValue == null ? "" : defaultValue);
                    input.setSelectAllOnFocus(true);
                    int pad = (int) (18 * getResources().getDisplayMetrics().density);
                    input.setPadding(pad, pad / 2, pad, pad / 2);
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("Zukait Time Track")
                            .setMessage(message == null ? "" : message)
                            .setView(input)
                            .setPositiveButton("OK", (dialog, which) -> result.confirm(input.getText().toString()))
                            .setNegativeButton("Cancel", (dialog, which) -> result.cancel())
                            .setOnCancelListener(dialog -> result.cancel())
                            .show();
                });
                return true;
            }

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

        webView.clearCache(true);
        webView.loadUrl("https://" + APP_HOST + "/assets/offline_test.html?v=108");
        handleUpdateInstallResult(getIntent());
        updateHandler.postDelayed(this::resumeUpdateDownloadMonitoring, 1200);
    }

    private String installedVersionName() {
        try {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private int installedVersionCode() {
        try {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                long code = info.getLongVersionCode();
                return code > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) code;
            }
            return info.versionCode;
        } catch (Exception e) {
            return 0;
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
            return installedVersionName();
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            return installedVersionCode();
        }

        @JavascriptInterface
        public void saveExportFile(String filename, String mime, String base64) {
            runOnUiThread(() -> {
                try {
                    byte[] data = Base64.decode(base64, Base64.DEFAULT);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        values.put(MediaStore.Downloads.MIME_TYPE, mime);
                        values.put(MediaStore.Downloads.IS_PENDING, 1);
                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) throw new Exception("Unable to create download");
                        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                            if (out == null) throw new Exception("Unable to open download");
                            out.write(data);
                        }
                        values.clear();
                        values.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, values, null, null);
                        android.widget.Toast.makeText(MainActivity.this, "Export saved to Downloads", android.widget.Toast.LENGTH_LONG).show();
                    } else {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(mime);
                        intent.putExtra(Intent.EXTRA_TITLE, filename);
                        pendingExportData = data;
                        startActivityForResult(intent, EXPORT_FILE_REQUEST);
                    }
                } catch (Exception e) {
                    android.widget.Toast.makeText(MainActivity.this, "Export could not be saved", android.widget.Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void printHtml(String html) {
            runOnUiThread(() -> {
                try {
                    WebView printView = new WebView(MainActivity.this);
                    printView.getSettings().setJavaScriptEnabled(false);
                    printView.setWebViewClient(new android.webkit.WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter("Zukait Job Card List");
                            pm.print("Zukait Job Card List", adapter, null);
                        }
                    });
                    printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    android.util.Log.e("ZukaitPrint", "Unable to print Job Card List", e);
                }
            });
        }

        @JavascriptInterface
        public void shareHtmlAsPdf(String html, String filename) {
            runOnUiThread(() -> {
                try {
                    String safeName = (filename == null || filename.trim().isEmpty()) ? "Zukait_Report.pdf" : filename.trim();
                    if (!safeName.toLowerCase().endsWith(".pdf")) safeName += ".pdf";
                    safeName = safeName.replaceAll("[^A-Za-z0-9._-]", "_");
                    final String finalName = safeName;
                    final File reportDir = new File(getCacheDir(), "reports");
                    if (!reportDir.exists()) reportDir.mkdirs();
                    final File pdfFile = new File(reportDir, finalName);
                    if (pdfFile.exists()) pdfFile.delete();

                    final WebView pdfView = new WebView(MainActivity.this);
                    pdfView.getSettings().setJavaScriptEnabled(false);
                    pdfView.setWebViewClient(new android.webkit.WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            try {
                                android.print.pdf.PrintedPdfDocument document =
                                        new android.print.pdf.PrintedPdfDocument(MainActivity.this,
                                                new PrintAttributes.Builder()
                                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                                        .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                                        .build());
                                android.graphics.pdf.PdfDocument.Page page = document.startPage(0);
                                int pageWidth = page.getCanvas().getWidth();
                                int contentWidth = Math.max(1, view.getWidth());
                                float scale = (float) pageWidth / (float) contentWidth;
                                page.getCanvas().save();
                                page.getCanvas().scale(scale, scale);
                                view.draw(page.getCanvas());
                                page.getCanvas().restore();
                                document.finishPage(page);
                                java.io.FileOutputStream out = new java.io.FileOutputStream(pdfFile);
                                document.writeTo(out);
                                out.close();
                                document.close();

                                Uri uri = FileProvider.getUriForFile(MainActivity.this,
                                        getPackageName() + ".updateprovider", pdfFile);
                                Intent share = new Intent(Intent.ACTION_SEND);
                                share.setType("application/pdf");
                                share.putExtra(Intent.EXTRA_STREAM, uri);
                                share.putExtra(Intent.EXTRA_SUBJECT, finalName);
                                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(Intent.createChooser(share, "Share PDF"));
                            } catch (Exception e) {
                                android.util.Log.e("ZukaitPdf", "Unable to create/share PDF", e);
                                android.widget.Toast.makeText(MainActivity.this, "PDF sharing failed", android.widget.Toast.LENGTH_LONG).show();
                            }
                        }
                    });
                    android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
                    int width = Math.max(1080, dm.widthPixels);
                    pdfView.measure(
                            android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                            android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED));
                    pdfView.layout(0, 0, pdfView.getMeasuredWidth(), Math.max(1, pdfView.getMeasuredHeight()));
                    pdfView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    android.util.Log.e("ZukaitPdf", "Unable to share PDF", e);
                    android.widget.Toast.makeText(MainActivity.this, "PDF sharing failed", android.widget.Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void checkForUpdates() {
            checkForUpdatesNative();
        }

        @JavascriptInterface
        public void openUpdatePage() {
            runOnUiThread(() -> startUpdateDownloadNative());
        }

        @JavascriptInterface
        public void startUpdateDownload() {
            runOnUiThread(() -> startUpdateDownloadNative());
        }

        @JavascriptInterface
        public void requestUpdateDownloadStatus() {
            runOnUiThread(() -> {
                restoreUpdateDownloadState();
                reportUpdateDownloadState();
            });
        }

        @JavascriptInterface
        public void installDownloadedUpdate() {
            runOnUiThread(() -> installDownloadedUpdateNative());
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
        public void startNativeVoiceNote() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingNativeVoiceNote = true;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                    return;
                }
                startNativeVoiceNoteInternal();
            });
        }

        @JavascriptInterface
        public void stopNativeVoiceNote() {
            runOnUiThread(() -> stopNativeVoiceNoteInternal(false));
        }

        @JavascriptInterface
        public void cancelNativeVoiceNote() {
            runOnUiThread(() -> stopNativeVoiceNoteInternal(true));
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

    private void startNativeVoiceNoteInternal() {
        try {
            stopNativeVoiceNoteInternal(true);
            voiceNoteFile = new File(getCacheDir(), "voice_note_" + System.currentTimeMillis() + ".m4a");
            voiceNoteRecorder = new MediaRecorder();
            voiceNoteRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            voiceNoteRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            voiceNoteRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            voiceNoteRecorder.setAudioEncodingBitRate(64000);
            voiceNoteRecorder.setAudioSamplingRate(44100);
            voiceNoteRecorder.setOutputFile(voiceNoteFile.getAbsolutePath());
            voiceNoteRecorder.prepare();
            voiceNoteRecorder.start();
            notifyNativeVoiceNoteToWeb("", "audio/mp4", "");
        } catch (Exception e) {
            releaseVoiceNoteRecorder();
            notifyNativeVoiceNoteToWeb("", "audio/mp4", "Microphone recorder could not start: " + e.getClass().getSimpleName());
        }
    }

    private void stopNativeVoiceNoteInternal(boolean discard) {
        if (voiceNoteRecorder == null) return;
        try { voiceNoteRecorder.stop(); } catch (Exception ignored) { }
        releaseVoiceNoteRecorder();
        if (discard) {
            if (voiceNoteFile != null) voiceNoteFile.delete();
            voiceNoteFile = null;
            return;
        }
        if (voiceNoteFile == null || !voiceNoteFile.exists() || voiceNoteFile.length() == 0) {
            notifyNativeVoiceNoteToWeb("", "audio/mp4", "No voice audio was recorded. Please try again.");
            return;
        }
        try (FileInputStream in = new FileInputStream(voiceNoteFile);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            notifyNativeVoiceNoteToWeb(base64, "audio/mp4", "");
        } catch (Exception e) {
            notifyNativeVoiceNoteToWeb("", "audio/mp4", "Voice note could not be prepared.");
        } finally {
            voiceNoteFile.delete();
            voiceNoteFile = null;
        }
    }

    private void releaseVoiceNoteRecorder() {
        if (voiceNoteRecorder != null) {
            try { voiceNoteRecorder.reset(); } catch (Exception ignored) { }
            try { voiceNoteRecorder.release(); } catch (Exception ignored) { }
            voiceNoteRecorder = null;
        }
    }

    private void notifyNativeVoiceNoteToWeb(String base64, String mime, String error) {
        if (webView == null) return;
        final String safeData = JSONObject.quote(base64 == null ? "" : base64);
        final String safeMime = JSONObject.quote(mime == null ? "audio/mp4" : mime);
        final String safeError = JSONObject.quote(error == null ? "" : error);
        webView.post(() -> webView.evaluateJavascript(
                "if(window.v73OnNativeVoiceNote){window.v73OnNativeVoiceNote(" + safeData + "," + safeMime + "," + safeError + ");}",
                null
        ));
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

    private String updateMetadataUrl() {
        return "https://raw.githubusercontent.com/zukaitauto/zukait-time-track-android/main/latest-version.json?ts=" + System.currentTimeMillis();
    }

    private void checkForUpdatesNative() {
        new Thread(() -> {
            int latestCode = 0;
            String latestName = "";
            boolean error = false;
            HttpURLConnection conn = null;
            try {
                URL url = new URL(updateMetadataUrl());
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache, no-store, max-age=0");
                conn.setRequestProperty("Pragma", "no-cache");
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
                        "if(window.v72UpdateCheckResult){window.v72UpdateCheckResult(" + code + ",'" + safeName + "'," + (failed ? "true" : "false") + ");}",
                        null
                );
            });
        }).start();
    }

    private void registerUpdateReceiver() {
        updateReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                restoreUpdateDownloadState();
                if (id != updateDownloadId) return;
                reportUpdateDownloadState();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(updateReceiver, filter);
    }

    private android.content.SharedPreferences updatePrefs() {
        return getSharedPreferences("zukait_update_state", MODE_PRIVATE);
    }

    private void persistUpdateDownloadState(long id, int targetCode) {
        updateDownloadId = id;
        updateTargetVersionCode = targetCode;
        updatePrefs().edit()
                .putLong("download_id", id)
                .putInt("target_version_code", targetCode)
                .apply();
    }

    private void removeDownloadedUpdate(long id) {
        if (id < 0) return;
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm != null) dm.remove(id);
        } catch (Exception ignored) { }
    }

    private void clearInstalledUpdateDownloadIfNeeded() {
        restoreUpdateDownloadState();
        if (updateDownloadId >= 0 && updateTargetVersionCode > 0 && installedVersionCode() >= updateTargetVersionCode) {
            long completedId = updateDownloadId;
            clearUpdateDownloadState();
            removeDownloadedUpdate(completedId);
        }
    }

    private void clearUpdateDownloadState() {
        updateDownloadId = -1;
        updateTargetVersionCode = 0;
        updatePrefs().edit().remove("download_id").remove("target_version_code").apply();
        if (updateProgressRunnable != null) updateHandler.removeCallbacks(updateProgressRunnable);
    }

    private void restoreUpdateDownloadState() {
        if (updateDownloadId < 0) {
            updateDownloadId = updatePrefs().getLong("download_id", -1);
            updateTargetVersionCode = updatePrefs().getInt("target_version_code", 0);
        }
    }

    private void resumeUpdateDownloadMonitoring() {
        restoreUpdateDownloadState();
        if (updateDownloadId >= 0) {
            reportUpdateDownloadState();
            startUpdateProgressMonitor();
        }
    }

    private void notifyUpdateDownloadToWeb(String status, int percent, long downloaded, long total, String message) {
        if (webView == null) return;
        final String safeStatus = JSONObject.quote(status == null ? "" : status);
        final String safeMessage = JSONObject.quote(message == null ? "" : message);
        webView.post(() -> webView.evaluateJavascript(
                "if(window.v77UpdateDownloadStatus){window.v77UpdateDownloadStatus(" +
                        safeStatus + "," + percent + "," + downloaded + "," + total + "," + safeMessage + ");}",
                null
        ));
    }

    private int reportUpdateDownloadState() {
        restoreUpdateDownloadState();
        if (updateDownloadId < 0) {
            notifyUpdateDownloadToWeb("IDLE", 0, 0, 0, "");
            return -1;
        }
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm == null) return -1;
        DownloadManager.Query q = new DownloadManager.Query().setFilterById(updateDownloadId);
        try (android.database.Cursor c = dm.query(q)) {
            if (c == null || !c.moveToFirst()) {
                clearUpdateDownloadState();
                notifyUpdateDownloadToWeb("IDLE", 0, 0, 0, "");
                return -1;
            }
            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloaded = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int percent = total > 0 ? (int) Math.max(0, Math.min(100, downloaded * 100L / total)) : 0;
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                notifyUpdateDownloadToWeb("COMPLETE", 100, downloaded, total, "Download complete. Ready to install.");
            } else if (status == DownloadManager.STATUS_FAILED) {
                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                clearUpdateDownloadState();
                notifyUpdateDownloadToWeb("FAILED", percent, downloaded, total, "Download failed (" + reason + "). Please try again.");
            } else if (status == DownloadManager.STATUS_PAUSED) {
                notifyUpdateDownloadToWeb("PAUSED", percent, downloaded, total, "Download paused. Waiting to continue.");
            } else if (status == DownloadManager.STATUS_PENDING) {
                notifyUpdateDownloadToWeb("PENDING", percent, downloaded, total, "Preparing download...");
            } else {
                notifyUpdateDownloadToWeb("DOWNLOADING", percent, downloaded, total, "Downloading update...");
            }
            return status;
        } catch (Exception e) {
            notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "Unable to read download status.");
            return -1;
        }
    }

    private void startUpdateProgressMonitor() {
        if (updateProgressRunnable != null) updateHandler.removeCallbacks(updateProgressRunnable);
        updateProgressRunnable = new Runnable() {
            @Override public void run() {
                int status = reportUpdateDownloadState();
                if (status == DownloadManager.STATUS_PENDING ||
                        status == DownloadManager.STATUS_RUNNING ||
                        status == DownloadManager.STATUS_PAUSED) {
                    updateHandler.postDelayed(this, 700);
                }
            }
        };
        updateHandler.post(updateProgressRunnable);
    }

    private boolean hasExistingUpdateDownload() {
        restoreUpdateDownloadState();
        if (updateDownloadId < 0) return false;
        int status = reportUpdateDownloadState();
        if (status == DownloadManager.STATUS_SUCCESSFUL ||
                status == DownloadManager.STATUS_PENDING ||
                status == DownloadManager.STATUS_RUNNING ||
                status == DownloadManager.STATUS_PAUSED) {
            startUpdateProgressMonitor();
            return true;
        }
        return false;
    }

    private void startUpdateDownloadNative() {
        if (updateEnqueueInProgress) {
            reportUpdateDownloadState();
            return;
        }
        if (hasExistingUpdateDownload()) return;
        updateEnqueueInProgress = true;
        notifyUpdateDownloadToWeb("PENDING", 0, 0, 0, "Checking update...");
        new Thread(() -> {
            int latestCode = 0;
            boolean error = false;
            HttpURLConnection conn = null;
            try {
                URL url = new URL(updateMetadataUrl());
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache, no-store, max-age=0");
                conn.setRequestProperty("Pragma", "no-cache");
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    latestCode = new JSONObject(sb.toString()).optInt("versionCode", 0);
                    if (latestCode <= 0) error = true;
                }
            } catch (Exception ex) {
                error = true;
            } finally {
                if (conn != null) conn.disconnect();
            }

            final int publishedCode = latestCode;
            final boolean failed = error;
            runOnUiThread(() -> {
                updateEnqueueInProgress = false;
                if (failed) {
                    notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "Unable to verify the latest version. Please try again.");
                    return;
                }
                if (publishedCode <= installedVersionCode()) {
                    clearUpdateDownloadState();
                    notifyUpdateDownloadToWeb("UP_TO_DATE", 100, 0, 0, "App is already up to date.");
                    return;
                }
                if (hasExistingUpdateDownload()) return;
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (dm == null) {
                        notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "Download service is unavailable.");
                        return;
                    }
                    Uri uri = Uri.parse("https://github.com/zukaitauto/zukait-time-track-android/releases/latest/download/ZUKAIT_TIME_TRACK_LATEST.apk");
                    DownloadManager.Request req = new DownloadManager.Request(uri)
                            .setTitle("Zukait Time Track Update")
                            .setDescription("Downloading update")
                            .setMimeType("application/vnd.android.package-archive")
                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                    long id = dm.enqueue(req);
                    persistUpdateDownloadState(id, publishedCode);
                    notifyUpdateDownloadToWeb("PENDING", 0, 0, 0, "Preparing download...");
                    startUpdateProgressMonitor();
                } catch (Exception e) {
                    notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "Unable to start download.");
                }
            });
        }).start();
    }

    private void installDownloadedUpdateNative() {
        android.widget.Toast.makeText(this, "Update installer started", android.widget.Toast.LENGTH_SHORT).show();
        notifyUpdateDownloadToWeb("INSTALLING", 100, 0, 0, "Native installer started...");
        restoreUpdateDownloadState();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent permissionIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                pendingInstallAfterPermission = true;
                updatePrefs().edit().putBoolean("pending_install_permission", true).apply();
                startActivityForResult(permissionIntent, UNKNOWN_SOURCES_REQUEST);
                notifyUpdateDownloadToWeb("PERMISSION_REQUIRED", 100, 0, 0,
                        "Allow Install unknown apps for Zukait Time Track, then return to continue the update.");
            } catch (Exception e) {
                notifyUpdateDownloadToWeb("FAILED", 100, 0, 0,
                        "Unable to open the Install unknown apps setting.");
            }
            return;
        }
        if (!downloadedUpdateIsReady()) {
            reportUpdateDownloadState();
            return;
        }

        // Use Android's normal package installer UI first. This is the most
        // compatible path across Samsung, Vivo, Oppo, Xiaomi and other OEMs.
        notifyUpdateDownloadToWeb("INSTALLING", 100, 0, 0, "Opening Android installer...");
        if (openDownloadedUpdateWithSystemInstaller()) return;

        // Only fall back to PackageInstaller when the device has no activity
        // capable of handling the standard APK install intent.
        installDownloadedUpdateWithPackageInstaller();
    }

    private boolean downloadedUpdateIsReady() {
        if (updateDownloadId < 0) {
            notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "No downloaded update is available.");
            return false;
        }
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm == null) return false;
        DownloadManager.Query q = new DownloadManager.Query().setFilterById(updateDownloadId);
        try (android.database.Cursor c = dm.query(q)) {
            return c != null && c.moveToFirst() &&
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) ==
                            DownloadManager.STATUS_SUCCESSFUL;
        } catch (Exception e) {
            notifyUpdateDownloadToWeb("FAILED", 0, 0, 0, "Downloaded update could not be verified.");
            return false;
        }
    }

    private boolean openDownloadedUpdateWithSystemInstaller() {
        File cachedApk = null;
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            Uri source = dm == null ? null : dm.getUriForDownloadedFile(updateDownloadId);
            if (source == null) throw new Exception("Downloaded APK URI unavailable");

            File updateDir = new File(getCacheDir(), "updates");
            if (!updateDir.exists() && !updateDir.mkdirs()) {
                throw new java.io.IOException("Unable to create update cache");
            }
            cachedApk = new File(updateDir, "ZUKAIT_TIME_TRACK_UPDATE.apk");
            try (java.io.InputStream in = getContentResolver().openInputStream(source);
                 java.io.OutputStream out = new java.io.FileOutputStream(cachedApk, false)) {
                if (in == null) throw new java.io.IOException("Downloaded APK stream unavailable");
                byte[] buffer = new byte[65536];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                out.flush();
            }
            if (!cachedApk.exists() || cachedApk.length() == 0) {
                throw new java.io.IOException("Cached APK is empty");
            }

            Uri apk = FileProvider.getUriForFile(
                    this, getPackageName() + ".updateprovider", cachedApk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apk, "application/vnd.android.package-archive");
            install.setClipData(android.content.ClipData.newRawUri("Zukait Time Track Update", apk));
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            android.content.pm.ResolveInfo resolved =
                    getPackageManager().resolveActivity(install, PackageManager.MATCH_DEFAULT_ONLY);
            if (resolved == null || resolved.activityInfo == null) {
                throw new android.content.ActivityNotFoundException("No Android package installer available");
            }
            grantUriPermission(resolved.activityInfo.packageName, apk, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
            notifyUpdateDownloadToWeb("INSTALLING", 100, 0, 0,
                    "Android installer opened. Tap Install to update.");
            return true;
        } catch (Exception error) {
            android.util.Log.e("ZukaitUpdate", "System installer launch failed", error);
            String detail = error.getClass().getSimpleName();
            if (error.getMessage() != null && !error.getMessage().trim().isEmpty()) {
                detail += ": " + error.getMessage();
            }
            notifyUpdateDownloadToWeb("INSTALL_DIAGNOSTIC", 100, 0, 0,
                    "SYSTEM INSTALLER FAILED — " + detail);
            android.widget.Toast.makeText(this,
                    "Installer error: " + detail, android.widget.Toast.LENGTH_LONG).show();
            if (cachedApk != null && cachedApk.exists() && cachedApk.length() == 0) cachedApk.delete();
            return false;
        }
    }

    private void installDownloadedUpdateWithPackageInstaller() {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        Uri apk = dm == null ? null : dm.getUriForDownloadedFile(updateDownloadId);
        if (apk == null) {
            notifyUpdateDownloadToWeb("FAILED", 100, 0, 0, "Downloaded update could not be opened.");
            return;
        }
        PackageInstaller.Session session = null;
        try {
            PackageInstaller installer = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(getPackageName());
            if (Build.VERSION.SDK_INT >= 31) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
            }
            int sessionId = installer.createSession(params);
            session = installer.openSession(sessionId);
            try (java.io.InputStream in = getContentResolver().openInputStream(apk);
                 java.io.OutputStream out = session.openWrite("zukait-update.apk", 0, -1)) {
                if (in == null) throw new java.io.IOException("Downloaded APK stream unavailable");
                byte[] buffer = new byte[65536];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                session.fsync(out);
            }
            Intent callback = new Intent(this, MainActivity.class);
            callback.setAction("com.zukait.timetrack.UPDATE_INSTALL_RESULT");
            callback.putExtra("package_installer_session", sessionId);
            android.app.PendingIntent pending = android.app.PendingIntent.getActivity(
                    this, UPDATE_INSTALL_REQUEST, callback,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
            notifyUpdateDownloadToWeb("INSTALLING", 100, 0, 0, "Android is verifying the signed update...");
        } catch (Exception e) {
            android.util.Log.e("ZukaitUpdate", "PackageInstaller fallback failed", e);
            String detail = e.getClass().getSimpleName();
            if (e.getMessage() != null && !e.getMessage().trim().isEmpty()) {
                detail += ": " + e.getMessage();
            }
            notifyUpdateDownloadToWeb("FAILED", 100, 0, 0,
                    "PACKAGE INSTALLER FAILED — " + detail);
            android.widget.Toast.makeText(this,
                    "PackageInstaller error: " + detail, android.widget.Toast.LENGTH_LONG).show();
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) { }
        }
    }

    private void handleUpdateInstallResult(Intent intent) {
        if (intent == null || !"com.zukait.timetrack.UPDATE_INSTALL_RESULT".equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                try {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(confirm);
                    notifyUpdateDownloadToWeb("INSTALLING", 100, 0, 0, "Confirm the Android installation.");
                    return;
                } catch (Exception ignored) { }
            }
            if (!openDownloadedUpdateWithSystemInstaller()) installDownloadedUpdateWithPackageInstaller();
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            clearInstalledUpdateDownloadIfNeeded();
        } else {
            android.util.Log.e("ZukaitUpdate", "Install status " + status + ": " + detail);
            if (!openDownloadedUpdateWithSystemInstaller()) installDownloadedUpdateWithPackageInstaller();
        }
        intent.setAction(null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleUpdateInstallResult(intent);
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == EXPORT_FILE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExportData != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out != null) out.write(pendingExportData);
                    android.widget.Toast.makeText(this, "Export saved", android.widget.Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    android.widget.Toast.makeText(this, "Export could not be saved", android.widget.Toast.LENGTH_LONG).show();
                }
            }
            pendingExportData = null;
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
            if (pendingNativeVoiceNote) {
                pendingNativeVoiceNote = false;
                if (granted) startNativeVoiceNoteInternal();
                else notifyNativeVoiceNoteToWeb("", "audio/mp4", "Microphone permission is disabled for Zukait Time Track.");
            }
            if (pendingNativeVoice) {
                pendingNativeVoice = false;
                if (granted) startNativeVoiceRecognitionInternal();
                else notifyVoiceResultToWeb("", "Microphone permission is disabled for Zukait Time Track.");
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        clearInstalledUpdateDownloadIfNeeded();
        restoreUpdateDownloadState();
        boolean permissionReturn = updatePrefs().getBoolean("pending_install_permission", false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                getPackageManager().canRequestPackageInstalls() && updateDownloadId >= 0) {
            reportUpdateDownloadState();
            if (permissionReturn || pendingInstallAfterPermission) {
                pendingInstallAfterPermission = false;
                updatePrefs().edit().remove("pending_install_permission").apply();
                updateHandler.postDelayed(this::installDownloadedUpdateNative, 250);
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
        if (updateProgressRunnable != null) updateHandler.removeCallbacks(updateProgressRunnable);
        if (updateReceiver != null) { try { unregisterReceiver(updateReceiver); } catch (Exception ignored) { } }
        if (speechRecognizer != null) { try { speechRecognizer.destroy(); } catch (Exception ignored) { } speechRecognizer = null; }
        if (voiceNoteRecorder != null) stopNativeVoiceNoteInternal(true);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
