# Google API Setup Guide

Google's Cloud Console can be a little overwhelming sometimes, so I created a walk-through guide on how to configure it. *Ironically enough, Chrome seems to be incompatible with this page sometimes, so you may need to use Edge instead*

1) Visit the [Google Cloud Console](https://console.cloud.google.com/home/) and create a new project.

2) Click the navigation menu in the top left corner followed by `APIs & Services`

![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/api_services.png?raw=true)

3) Click `Enable APIs and services` 

4) Search for `Google Calendar` and enable it. Once its enabled click `Manage`

![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/calendar_api.png?raw=true)

5) View `Credentials` and click the `Create` button

6) Create a new `OAuth client ID` with "Type" set to `Web Application`

7) Add a new `Authorized redirect URI` and set it to `http://localhost:8080/google/auth`

8) Save the credentials and download them. It should look something like this:

![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/web_client.png?raw=true)

9) Rename the file to credentials.json and move it to your project directory

10) Moving back to the webpage, return to the APIs and Services page by following the link. Now go into the `OAuth consent screen` section.

![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/navigate_back.png?raw=true)
![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/goto_consent_screen.png?raw=true)

11) From here on it's pretty simple.
    - Things like app name, user support, and developer contact can be whatever you want, as long as Google likes it. 
    - Just set "Authorized domains"  to `google.com`
    - The next page is for scope configuration. Make sure it has:
        - `./auth/calendar`
        - `./auth/calendar.calendarlist`
    - You probably want to set yourself as a test user, although I'm not sure if it makes a difference.

![](https://github.com/yureiTxt/ThdhrCal/blob/master/docs/scopes.png?raw=true)

---

And you're done! Start the project with `node main.js`. The first time will generate a user consent page via Google and save the schedule information. Run it again to have it uploaded to your calendar.