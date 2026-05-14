# VoltType Support Canned Replies

Use these as draft replies. Personalize the greeting and never promise a refund, fix, or account action before checking the customer record.

## 1. Windows SmartScreen Warning

Hi {{name}}, that Windows SmartScreen message is expected right now because VoltType is new indie software and our installer is not code-signed yet. Click **More info** and then **Run anyway** to continue the install; we explain the same step on the download section at https://volttype.com/#download. We are working on code signing so this warning becomes less scary for new users.

## 2. Microphone Not Working

Hi {{name}}, please check that Windows allows microphone access for desktop apps, then open VoltType Settings and confirm the selected microphone is the one you are using. If it still fails, restart VoltType from the tray and try the hotkey again in Notepad first. The setup notes are in the FAQ at https://volttype.com/#faq.

## 3. Overlay Stuck On Processing

Hi {{name}}, sorry, that should not happen. The latest VoltType build has a safety timeout that clears the processing state if Windows audio recording hangs, so please update and restart the app from the tray. If it happens again, send us the app version and whether you were using Cloud or Local mode; the troubleshooting FAQ starts at https://volttype.com/#faq.

## 4. Dictation Dropped Text

Hi {{name}}, if VoltType transcribed but nothing appeared, the text should remain in your clipboard so you can press **Ctrl+V** in the target app. The newest build also retries paste once and is less aggressive about filtering quiet speech, so please update before retesting. Try one sentence in Notepad first, then the app where it failed; the FAQ is at https://volttype.com/#faq.

## 5. Refund Request

Hi {{name}}, thanks for trying VoltType, and sorry it did not fit your workflow. Send us the email used at checkout and the reason for the refund request, and we will review it against the refund policy in our Terms: https://volttype.com/terms-of-service.html. If there is a bug involved, include the exact app and Windows version so we can fix it properly.

## 6. Auto-Update Failed

Hi {{name}}, please close VoltType from the tray, reopen it, and wait a minute; the updater checks GitHub releases automatically. If it still does not update, download the newest installer from https://volttype.com/#download and install it over your current copy. Your settings should stay in place, and the FAQ is at https://volttype.com/#faq.

## 7. License Or Activation Problem

Hi {{name}}, please sign in inside the VoltType desktop app with the same email you used at checkout. If the license still does not activate, send us that email and a screenshot of the Settings or account screen so we can check the subscription status. License terms are covered here: https://volttype.com/terms-of-service.html.

## 8. Does VoltType Work Offline?

Hi {{name}}, yes, VoltType can work offline when you use the Local Whisper engine. Download the local model once in Settings, then dictation runs on your computer without sending voice audio to our server. The privacy FAQ explains the difference between cloud and local mode at https://volttype.com/#faq and https://volttype.com/privacy-policy.html.
