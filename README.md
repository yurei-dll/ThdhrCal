# ThdhrCal
Mostly designed for private use, but other Home Depot employees may find it useful as well.

## Purpose
This script will check [Home Depot](https://mythdhr.com), and import the work schedule to a Google Calendar. Useful for part-time associates and those with inconsistent schedules.

## Variables
Make a [.env](https://www.npmjs.com/package/dotenv) file to configure your login info:
- `HD_STORE_NUMBER`
- `HD_USERNAME`
- `HD_PASSWORD`

## Google API
Google API info goes in a file named "credentials.json" - see [Google Workspace](https://developers.google.com/workspace/guides/create-credentials) for more info. After user consent, the client key will be saved in "token.json" for future use. Authentication with Google can be a little tricky, so [here's](https://developers.google.com/identity/protocols/oauth2) a guide for those who want it. I also made a [walk-through](https://github.com/yureiTxt/ThdhrCal/blob/master/setupGuide.md) for this specific use.

The schedule itself will be put on whatever calendar is called "Work Schedule" and one will be created if it's not already there. Since events are created on the user's behalf, the required scopes are:
- `./auth/calendar`
- `./auth/calendar.calendarlist`