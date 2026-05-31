# GetStampd — Tester Runbook (one page)

Thanks for helping test GetStampd. Please go through this on a real phone,
not a laptop, and use the public event link the organiser sent you.

## 1. Open the event link

Open the link on your phone. It looks like:

```
https://<event>.getstampd.com.au/
```

You should see the event landing page with a "Start your passport" button.
If you see a "Workspace not found" screen, stop and report the URL.

## 2. Create your passport

- Tap **Start your passport** (or open `/join`).
- Enter your name and email (use a real inbox — confirmation may be required).
- Submit. You should land on **My Passport** with empty stamp slots.

## 3. Visit a venue page

- Open the bottom nav → **Venues**, or `/venues`.
- Tap any venue. The venue page should show name, photo, description,
  address, and an Apple Maps location.

## 4. Scan the QR code at the venue

- At the venue, find the printed GetStampd poster.
- Use the in-app scanner (bottom nav → **Scan**) **or** your phone's Camera app.
- The URL on the QR is always `https://<event>.getstampd.com.au/checkin/<token>`.
  Never `/live/...`, never an admin URL.

## 5. Confirm the stamp appears

- After scanning you should land on a green confirmation screen.
- Tap **View my passport** — the venue's stamp should now be filled in.
- Scanning the same QR again should show **Already stamped**, not an error.

## 6. Check the leaderboard

- Bottom nav → **Leaderboard** (`/leaderboard`).
- Your name should appear with the current stamp count within a few seconds.

## 7. Reporting bugs

For every bug, please include:

1. **Screenshot or screen recording.**
2. **Phone + browser** (e.g. "iPhone 15, Safari" / "Pixel 8, Chrome").
3. **Exact URL** at the moment the bug happened (copy from the address bar).
4. **Copied support details** — many error screens (Passport not found,
   Check-in error, Trail Map error, Scan error) have a *Copy support details*
   button. Tap it and paste the result into the bug report.
5. One sentence describing what you expected vs what happened.

Send reports to the organiser who invited you.
