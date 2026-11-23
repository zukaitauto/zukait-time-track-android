import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const native=fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java','utf8');
assert.match(native,/pending\.dialog\.setOnDismissListener\(dialog -> pending\.cancel\(\)\)/);
assert.match(native,/builder\.setOnCancelListener\(dialog -> pending\.cancel\(\)\)/);
assert.match(native,/protected void onStop\(\) \{\s*activityStopped = true;\s*cancelJavaScriptDialogs\(\);/);
assert.match(native,/protected void onDestroy\(\) \{\s*activityStopped = true;\s*cancelJavaScriptDialogs\(\);/);
assert.match(native,/activityStopped \|\| isFinishing\(\) \|\| isDestroyed\(\)/);
assert.match(native,/catch \(RuntimeException error\) \{\s*pending\.cancel\(\);/);
assert.match(native,/\(\(JsPromptResult\) result\)\.confirm\(input\.getText\(\)\.toString\(\)\)/);
assert.match(native,/if \(canCancel\) builder\.setNegativeButton/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-dialog-'));
try{
 fs.writeFileSync(path.join(dir,'JsDialogCompletion.java'),fs.readFileSync('app/src/main/java/com/zukait/timetrack/JsDialogCompletion.java','utf8'));
 fs.writeFileSync(path.join(dir,'DialogLifecycleTest.java'),`package com.zukait.timetrack;
import java.util.concurrent.atomic.AtomicInteger;
public class DialogLifecycleTest {
 public static void main(String[] args) throws Exception {
  AtomicInteger yes=new AtomicInteger(), no=new AtomicInteger();
  JsDialogCompletion ok=new JsDialogCompletion();
  ok.finish(yes::incrementAndGet); ok.finish(no::incrementAndGet);
  if(yes.get()!=1||no.get()!=0)throw new AssertionError("OK then dismiss must not cancel");
  JsDialogCompletion stopped=new JsDialogCompletion();
  stopped.finish(no::incrementAndGet); stopped.finish(yes::incrementAndGet);
  if(yes.get()!=1||no.get()!=1)throw new AssertionError("stopped dialog must never approve");
  JsDialogCompletion race=new JsDialogCompletion(); AtomicInteger answers=new AtomicInteger();
  Thread[] threads=new Thread[30];
  for(int i=0;i<threads.length;i++){threads[i]=new Thread(()->race.finish(answers::incrementAndGet));threads[i].start();}
  for(Thread t:threads)t.join();
  if(answers.get()!=1)throw new AssertionError("race must resolve once");
  JsDialogCompletion throwing=new JsDialogCompletion();
  try{throwing.finish(()->{throw new RuntimeException("closed renderer");});}catch(RuntimeException expected){}
  throwing.finish(yes::incrementAndGet);
  if(yes.get()!=1)throw new AssertionError("failed callback must not repeat");
 }
}`);
 execFileSync('javac',['-d',dir,path.join(dir,'JsDialogCompletion.java'),path.join(dir,'DialogLifecycleTest.java')],{stdio:'pipe'});
 execFileSync('java',['-cp',dir,'com.zukait.timetrack.DialogLifecycleTest'],{stdio:'pipe'});
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Native dialogs: dismiss, lifecycle cancel, exact-once races, prompt, stopped activity and display failure passed');
