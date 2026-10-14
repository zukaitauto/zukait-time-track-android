package com.zukait.timetrack;

import android.Manifest;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.intent.Intents;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static org.junit.Assert.*;

// Offline, synthetic documents only. Chooser intents are intercepted; no messages are sent.
@RunWith(AndroidJUnit4.class)
public class PdfExportTest {
    @Rule public GrantPermissionRule notifications = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS);
    @Before public void before() {
        Intents.init();
        Intents.intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, null));
    }
    @After public void after() { Intents.release(); }
    private List<File> files(File folder, String name) {
        List<File> result = new ArrayList<>();
        File[] children = folder.listFiles();
        if (children != null) for (File file : children) {
            if (file.isDirectory()) result.addAll(files(file, name));
            else if (file.getName().equals(name)) result.add(file);
        }
        return result;
    }
    private File export(String html, String name) throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final MainActivity.AndroidBridge[] bridge = new MainActivity.AndroidBridge[1];
            scenario.onActivity(activity -> { bridge[0] = activity.new AndroidBridge(); bridge[0].shareHtmlAsPdf(html, name); });
            Field busy = bridge[0].getClass().getDeclaredField("pdfExportBusy"); busy.setAccessible(true);
            long deadline = System.currentTimeMillis() + 80000;
            while (System.currentTimeMillis() < deadline && busy.getBoolean(bridge[0])) Thread.sleep(100);
            assertFalse("PDF exporter must complete or fail instead of hanging", busy.getBoolean(bridge[0]));
            List<File> reports = files(new File(app.getCacheDir(), "reports"), name);
            return reports.isEmpty() ? null : reports.get(reports.size()-1);
        }
    }
    private int visiblePages(File file) throws Exception {
        assertNotNull("Native renderer must produce a report", file);
        assertTrue(file.length() > 1000);
        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer renderer = new PdfRenderer(fd)) {
            for (int pageIndex = 0; pageIndex < renderer.getPageCount(); pageIndex++) {
                try (PdfRenderer.Page page = renderer.openPage(pageIndex)) {
                    Bitmap image = Bitmap.createBitmap(794,1123,Bitmap.Config.ARGB_8888);
                    try {
                        image.eraseColor(Color.WHITE);page.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        int ink=0;for(int y=0;y<1123;y+=3)for(int x=0;x<794;x+=3){int c=image.getPixel(x,y);if(Color.alpha(c)>0&&(Color.red(c)<235||Color.green(c)<235||Color.blue(c)<235))ink++;}
                        assertTrue("Native PDF page "+pageIndex+" must contain visible report content",ink>20);
                    } finally { image.recycle(); }
                }
            }
            return renderer.getPageCount();
        }
    }
    @Test public void completeMultiPageReportUsesValidatedDocumentRenderer() throws Exception {
        StringBuilder rows = new StringBuilder();for(int i=1;i<=140;i++)rows.append("<tr><td>JC 12079 · Employee QA · Saved work "+i+"</td><td>OMR 80.000</td></tr>");
        File file=export("<!doctype html><html><head><meta charset='utf-8'><style>body{font:14px Arial}td{padding:8px;border-bottom:1px solid #ddd}tr{break-inside:avoid}</style></head><body><h1>Supervisor report · TEST ONLY</h1><table>"+rows+"</table><p>END OF ORIGINAL REPORT</p></body></html>","native-multipage-test.pdf");
        assertTrue("Long report must retain multiple pages",visiblePages(file)>1);
        Intent chooser=Intents.getIntents().stream().filter(intent->Intent.ACTION_CHOOSER.equals(intent.getAction())).findFirst().orElse(null);
        assertNotNull("Share can start only after PDF validation",chooser);
        Intent send=chooser.getParcelableExtra(Intent.EXTRA_INTENT);
        assertEquals("application/pdf",send.getType());assertEquals("content",send.getParcelableExtra(Intent.EXTRA_STREAM,android.net.Uri.class).getScheme());
        assertTrue((send.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);
    }
    @Test public void bilingualEstimateRemainsOneA4Page() throws Exception {
        Context test=InstrumentationRegistry.getInstrumentation().getContext();
        String html;try(java.io.InputStream input=test.getAssets().open("estimate-native-fixture.html")){html=new String(input.readAllBytes(),StandardCharsets.UTF_8);}
        assertTrue(html.contains("REPAIR ESTIMATE"));assertTrue(html.contains("150.000"));
        assertEquals("Normal estimate should remain one readable A4 page",1,visiblePages(export(html,"native-estimate-test.pdf")));
    }
    @Test public void allWhitePdfIsRejectedBeforeSharing() throws Exception {
        assertNull(export("<html><body style='color:white;background:white'>Invisible report must never be shared</body></html>","native-blank-test.pdf"));
        assertFalse("Blank PDF cannot launch a chooser",Intents.getIntents().stream().anyMatch(intent->Intent.ACTION_CHOOSER.equals(intent.getAction())));
    }
}
