// Make sure to check the environment variables in the README.md file - there is no fault tolerance here.

const puppeteer = require('puppeteer');
const http = require('http');
const { google } = require('googleapis');
const fs = require('fs');
const url = require('url');
const { oauth2 } = require('googleapis/build/src/apis/oauth2');
const { OAuth2Client } = require('google-auth-library');

require('dotenv').config();
const destSite = "https://hdapps.homedepot.com/LaborMgtTools/WFMEssLauncher"

// If modifying these scopes, delete token.json.
const SCOPES = [
    'https://www.googleapis.com/auth/calendar'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = './token.json';

var workDays = [];
if (!fs.existsSync('./workDays.json')) { // if the file doesn't exist, create it
    fs.writeFileSync('./workDays.json', JSON.stringify(workDays, 4));
    collectData().then(uploadScheduleInfo);
} else {
    // First check if the last day is less than 2 weeks from now
    var fileData = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));
    var lastDay = fileData[fileData.length - 1];
    var lastDayDate = new Date(lastDay.date);
    var today = new Date();
    var diff = Math.abs(today - lastDayDate);
    var diffDays = Math.ceil(diff / (1000 * 3600 * 24));
    if (diffDays > 14) {
        // Time to collect data again
        collectData().then(uploadScheduleInfo);
    } else {
        // No data collection needed, just upload the schedule info if applicable
        uploadScheduleInfo();
    }
}



// Home Depot stuff

async function collectData() {
    puppeteer.launch({
        headless: false,
        // viewport has to be big enough to see the entire page
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            "--window-size=1280,720"
        ],
    }).then(async browser => {
        //set up the browser
        //set the viewport to fill the window
        const page = await browser.newPage();
        await page.setViewport({
            width: 1280,
            height: 720
        });
        await page.goto(destSite);
        var storeNumField = await page.$('#column1content > form > div > table.form > tbody > tr:nth-child(2) > td:nth-child(2) > input[type=text]:nth-child(4)');
        var userField = await page.$("#column1content > form > div > table.form > tbody > tr:nth-child(3) > td:nth-child(2) > input[type=text]")
        var passField = await page.$("#column1content > form > div > table.form > tbody > tr:nth-child(4) > td:nth-child(2) > input[type=password]")
        var loginButton = await page.$("#submit")

        storeNumField.type(process.env.HD_STORE_NUMBER).then(async () => {
            userField.type(process.env.HD_USERNAME).then(async () => {
                passField.type(process.env.HD_PASSWORD).then(async () => {
                    console.log("Logging in...")
                    loginButton.click().then(collectData)
                });
            });
        });

        const collectData = async () => {
            // Wait for the page to load
            page.waitForNavigation({ waitUntil: 'networkidle0' }).then(async () => {
                var tableArea = await page.$("#calendar > div.dates")

                console.log("Page loaded")
                // click all the minimize buttons with the class "toggle max"
                await page.$$eval("span.toggle.max", buttons => {
                    buttons.forEach(button => button.children[0].click());
                }).then(async () => {
                    // Parse the rows and start collecting data
                    var rows = await tableArea.$$("#calendar > div.dates > ul");
                    for (var i = 0; i < rows.length; i++) {
                        var row = rows[i]
                        var cells = await row.$$("li")
                        for (var j = 0; j < cells.length; j++) {
                            var dateString;
                            var timeString;
                            page.evaluate(cell => {
                                if (cell.getElementsByClassName("toggle min").length > 0) return;
                                if (cell.children.length > 1) {
                                    timeString = cell.getElementsByClassName("hours")[0].innerText;
                                    dateString = cell.getElementsByClassName("date")[0].innerText;
                                    if (!timeString || !dateString) { return null } else {
                                        return {
                                            dateString: dateString,
                                            timeString: timeString
                                        }
                                    }
                                }
                            }, cells[j]).then(async data => {
                                // Push the data to the array
                                if (data) {
                                    workDays.push({
                                        date: data.dateString,
                                        start: data.timeString.split("-")[0],
                                        end: data.timeString.split("-")[1]
                                    })
                                }

                            });
                            // Wait until the last cell of the last row is done and then write the data to the file
                            if (j == cells.length - 1 && i == rows.length - 1) {
                                setTimeout(() => {
                                    browser.close().then(writeToFile)
                                }, 1000)
                            }
                        }
                    }
                });
            });
        }

        const writeToFile = () => {
            var fileData = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));
            workDays.forEach(day => {
                // Check if it's already in the array
                // If its not, add it with "alreadyShared" set to false
                var found = fileData.find(oldDay => oldDay.date === day.date);
                if (!found) {
                    console.log("Adding new day: " + day.date)
                    fileData.push({
                        date: day.date,
                        start: day.start,
                        end: day.end,
                        alreadyShared: false
                    })
                }
            });
            // Write the new data to the file
            fs.writeFileSync('./workDays.json', JSON.stringify(fileData, 4));
            console.log("Schedule information saved")
            browser.close().then(Promise.resolve());
        }

    }).catch(err => {
        console.log(err);
        Promise.reject(err);
    });
}

// Google API stuff

function uploadScheduleInfo() {
    console.log("Uploading schedule information to Google Calendar...")
    // Find all the days that have not been shared yet
    var fileData = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));
    var daysToShare = fileData.filter(day => !day.alreadyShared);
    // If there are no days to share, exit
    if (daysToShare.length == 0) {
        console.log("Google Calendar is up to date!")
        return;
    }
    // Auth with Google and add the events
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);
        // Get the time zone of the system
        var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Parse for google
        let shareQueue = []
        daysToShare.forEach(day => {
            let obj = {
                "summary": "Work",
                "start": {
                    "dateTime": day.date + "T" + day.start + ":00-07:00",
                    "timeZone": timeZone
                },
                "end": {
                    "dateTime": day.date + "T" + day.end + ":00-07:00",
                    "timeZone": timeZone
                }
            }
            shareQueue.push(obj)
        })

        // Authorize a client with credentials, then call the Google Calendar API.
        authorize(JSON.parse(content), (auth) => {
            // Fetch the list of calendars to see if it's already there
            var calendar = google.calendar({ version: 'v3', auth });


            google.calendar({ version: 'v3', auth }).events.insert({
                auth: auth,
                calendarId: 'primary',
                resource: shareQueue
            }, (err, res) => {
                if (err) return console.log('The API returned an error: ' + err);
                console.log("Successfully added events to Google Calendar!")
                // Mark all the days as shared
                daysToShare.forEach(day => {
                    var index = fileData.findIndex(oldDay => oldDay.date === day.date);
                    fileData[index].alreadyShared = true;
                })
                fs.writeFileSync('./workDays.json', JSON.stringify(fileData, 4));
            });
        });


    });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    // Create a http server to listen for the callback and capture the code
    var server = http.createServer().listen('8080');
    server.on('request', function (req, res) {
        let parsed = url.parse(req.url, true);
        var code = parsed.query.code;
        if (!code) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Callback</title></head><body>Authentication complete</body></html>');
        console.log("Authentication complete\nRetrieving access token...");
        oAuth2Client.getToken(code).then((res) => {
            if (res.err) return console.error('Error retrieving access token', res.err);
            oAuth2Client.setCredentials(res.tokens.access_token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(res.tokens.access_token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
                server.close();
                server.once('close', () => {
                    callback(oAuth2Client);
                });
            });
        })
    });
    console.log("Waiting for authentication...")
}
