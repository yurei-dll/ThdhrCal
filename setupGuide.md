# Google API Setup Guide

Google's Cloud Console can be a little overwhelming sometimes, so I created a walk-through guide on how to configure it.

1) Visit the [Google Cloud Console](https://console.cloud.google.com/home/) and create a new project.

2) Click the `navigation` menu in the corner followed by `APIs & Services`

3) Click `Enable APIs and services`

4) Search for `Google Calendar` and enable it. Once its enabled click `Manage`

5) View `Credentials` and click the `Create` button

6) Create a new `OAuth client ID` with "Type" set to `Web Application`

7) Add a new `Authorized redirect URI` and set it to `http://localhost:8080/google/auth`

8) Save the credentials and download them

9) Rename the file to credentials.json and move it to your project directory

And you're done! Start the project with `node main.js`. The first time will generate a user consent page via Google and save the schedule information. Run it again to have it uploaded to your calendar.