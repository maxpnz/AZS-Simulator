package ru.azs.simulator;

import android.os.Bundle;
import android.os.Build;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.content.Context;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean wantsAudio = false;
    private boolean hasAudioFocus = false;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_GAIN) dispatchAudioFocus(true);
        else if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) dispatchAudioFocus(false);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface public void acquire() { runOnUiThread(() -> { wantsAudio = true; requestAudioFocus(); }); }
            @JavascriptInterface public void release() { runOnUiThread(() -> { wantsAudio = false; releaseAudioFocus(); }); }
        }, "AZSAudioFocus");
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
    }

    private void dispatchAudioFocus(boolean gained) {
        hasAudioFocus = gained;
        if (getBridge() != null && getBridge().getWebView() != null)
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('azs-audio-focus-" + (gained ? "gained" : "lost") + "'))", null));
    }

    private void requestAudioFocus() {
        if (!wantsAudio || hasAudioFocus || audioManager == null) return;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest == null) focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener(focusListener).build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        dispatchAudioFocus(result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
    }

    private void releaseAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
        else audioManager.abandonAudioFocus(focusListener);
        hasAudioFocus = false;
    }

    @Override public void onPause() { releaseAudioFocus(); super.onPause(); }
    @Override public void onResume() { super.onResume(); requestAudioFocus(); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
        if (!hasFocus) dispatchAudioFocus(false);
        else if (wantsAudio) requestAudioFocus();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
