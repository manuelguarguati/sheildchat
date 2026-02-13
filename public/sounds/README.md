# Notification Sounds

Place your notification sound files in this directory.

## Supported Formats
- MP3 (.mp3)
- OGG (.ogg)
- WAV (.wav)

## Default Sound
For the default notification, add a file named:
- `notification.mp3`

## Example
If you have a notification sound file, simply copy it to this directory:
```bash
cp /path/to/notification.mp3 public/sounds/notification.mp3
```

## Volume
The notification sound volume is set to 50% by default. You can adjust this in `public/js/chat.js` in the `initNotificationSound()` method.
