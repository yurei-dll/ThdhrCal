// Make sure to check the environment variables in the README.md file - there is no fault tolerance here.

const puppeteer = require('puppeteer');
const http = require('http');
const Google = require('googleapis');
const moment = require('moment-timezone');
const fs = require('fs');
const os = require('os');
const url = require('url');

var token;
var puppeteer_running = false;
var work_schedule = [];

var cred = require('./credentials.json');
const AuthClient = new Google.Auth.OAuth2Client(
    cred.web.client_id,
    cred.web.client_secret,
    cred.web.redirect_uris[0]
);
const calendar = new Google.calendar_v3.Calendar(
    { auth: AuthClient }
);

require('dotenv').config();
const target_webpage = "https://hdapps.homedepot.com/LaborMgtTools/WFMEssLauncher"
const api_scopes = [ // Don't modify without deleting the token json file
    'https://www.googleapis.com/auth/calendar'
];


// See if the work schedule file is missing or outdated
if (!fs.existsSync('./workDays.json')) { // if the file doesn't exist, create it
    fs.writeFileSync('./workDays.json', JSON.stringify(work_schedule, 4));
    finalCheck();
} else {
    try {
        // First check if the last day is less than 2 weeks from now
        var fileData = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));
        var lastDay = new Date(fileData[fileData.length - 1].date);
        var now = new Date();
        var diff = now.getTime() - lastDay.getTime();
        if (diff < (1.21e+9)) { // if the last day is more than 2 weeks old, get a new schedule
            getSchedule().then(finalCheck);
        } else {
            // Skip data collection to be nice to the server... for now >:)
            finalCheck();
        }
    } catch (err) {
        finalCheck();
    }
}

// Check configuration
if (!process.env.HD_STORE_NUMBER) throw new Error("Missing HD_STORE_NUMBER environment variable");
if (!process.env.HD_PASSWORD) throw new Error("Missing HD_STORE_PASSWORD environment variable");
if (!process.env.HD_USERNAME) throw new Error("Missing HD_USERNAME environment variable");



// Home Depot stuff
////////////////////////////////////////////////////////////////////////////////

async function getSchedule() {
    if (puppeteer_running) return new Error("Puppeteer is already running.");
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
        puppeteer_running = true;

        //set up the browser
        //set the viewport to fill the window
        const page = await browser.newPage();
        await page.setViewport({
            width: 1280,
            height: 720
        });
        await page.goto(target_webpage);
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
                                if (!data) return;
                                // Push the data to the array
                                let timeStrings = data.timeString.split("-");
                                if (timeStrings.length < 2) return;
                                // Normalize the time strings
                                timeStrings[0].charAt(timeStrings[0].length - 1) === " " ? timeStrings[0] = timeStrings[0].trim() + "m" : null;
                                timeStrings[0].charAt(0) === " " ? timeStrings[0] = timeStrings[0].substring(1) + "m" : null;
                                timeStrings[1].charAt(timeStrings[1].length - 1) === " " ? timeStrings[1] = timeStrings[1].trim() + "m" : null;
                                timeStrings[1].charAt(0) === " " ? timeStrings[1] = timeStrings[1].substring(1) + "m" : null;
                                if (data) {
                                    work_schedule.push({
                                        date: data.dateString,
                                        start: timeStrings[0],
                                        end: timeStrings[1]
                                    })
                                }

                            });
                            // Wait until the last cell of the last row is done and then write the data to the file
                            if (j == cells.length - 1 && i == rows.length - 1) {
                                setTimeout(() => {
                                    puppeteer_running = false;
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
            work_schedule.forEach(day => {
                // Check if it's already in the array
                // If its not, add it with event_id set to -1
                // This will be updated later once it's uploaded
                var found = fileData.find(file => file.date === day.date);
                if (!found) {
                    console.log("Adding new day: " + day.date)
                    fileData.push({
                        date: day.date,
                        start: day.start,
                        end: day.end,
                        status: "pending"
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
////////////////////////////////////////////////////////////////////////////////

// Generate a consent page URL
function promptForAuth() {
    const consentUrl = AuthClient.generateAuthUrl({
        access_type: 'offline',
        scope: api_scopes
    });
    console.log("Visit this page for authorization: " + consentUrl);
}

// Listen on 8080 for callback to /google/auth with code in query string
function waitForAuth() {
    let webserver = http.createServer(function (req, res) {
        var q = url.parse(req.url, true).query;
        if (q.code) {
            AuthClient.getToken(q.code, function (err, authToken) {
                if (err) {
                    console.log(err);
                    res.end("Error getting token");
                    return;
                }
                fs.writeFileSync('./token.json', JSON.stringify(authToken));
                token = authToken;
                res.end("It worked! You can close this page now.");
                finalCheck();
                webserver.close();
            });
        } else {
            res.end("Something went wrong. Credentials.json is probably outdated.");
        }
    }).listen(8080);
}

// Ensures a token is available and the auth is ready to use
function finalCheck() {
    if (!fs.existsSync('./token.json')) {
        console.log("No token found. Starting consent flow.");
        promptForAuth();
        waitForAuth();
    } else {
        work_schedule = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));
        if (work_schedule.length == 0) {
            getSchedule();
        } else {
            console.log("Starting upload.");
            token = JSON.parse(fs.readFileSync('./token.json'));
            startUpload();
        }
    }
}

function startUpload() {
    let localTimezoneOffset = new Date().getTimezoneOffset() / 60;
    let localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let year = new Date().getFullYear();
    var calendarId = "primary"; // just a fallback
    var queue = [];

    AuthClient.setCredentials(token);
    let fileData = JSON.parse(fs.readFileSync('./workDays.json', 'utf8'));

    // Collect days from workDays.json
    JSON.parse(fs.readFileSync('./workDays.json', 'utf8'))
        .filter(day => day.status === "pending")
        .forEach(obj => queue.push(obj));

    // Check calendar list for one called "Work Schedule" and create it if it doesn't exist
    calendar.calendarList.list().then(res => {
        console.log(res); // temp
        var found = res.data.items.find(cal => cal.summary === "Work Schedule");
        if (!found) {
            calendar.calendars.insert(
                {
                    resource: {
                        summary: "Work Schedule",
                        timeZone: localTimezone
                    }
                }
            ).then(res => {
                console.log("Created a work calendar");
                calendarId = res.data.id;
            });
        } else {
            // Update the calendar ID to use
            calendarId = found.id;
        }


        var lastDay;
        var queueWorker = setInterval(() => {
            let workDay = queue.shift();
            if (workDay) {
                var dateString = workDay.date.split("/")[0] + "-" + workDay.date.split("/")[1]
                if (workDay.date == "1/1" && lastDay == "12/31") year++;

                /** Google Calendar is very picky.
                * Using RFC3339 formatting.
                */

                let startTime = moment(workDay.start, "h:mm a").format("HH:mm:ss");
                let endTime = moment(workDay.end, "h:mm a").format("HH:mm:ss");

                calendar.events.insert({
                    auth: AuthClient,
                    calendarId: calendarId,
                    resource: {
                        summary: "Work",
                        description: "Work schedule for " + workDay.date,
                        // Dont bother using the Date constructor, Google hates it
                        start: {
                            dateTime: year + "-" + dateString + "T" + startTime,
                            timeZone: localTimezone
                        },
                        end: {
                            dateTime: year + "-" + dateString + "T" + endTime,
                            timeZone: localTimezone
                        }
                    }
                }
                    , (err, event) => {
                        if (err) {
                            console.log(err);
                            throw err
                        }
                        if (event.data) {
                            console.log(workDay.date + ":" + event.data.status);
                            fileData.find(day => day.date === workDay.date).status = event.data.status;
                            fs.writeFileSync('./workDays.json', JSON.stringify(fileData, 4));
                        }
                    });
                lastDay = workDay;
            } else {
                console.log("All entries uploaded!");
                console.log("Check your new calendar at: https://calendar.google.com/")
                clearInterval(queueWorker);
            }
        }, 1200);

    });


}