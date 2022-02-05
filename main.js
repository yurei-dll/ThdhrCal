// Make sure to check the environment variables in the README.md file - there is no fault tolerance here.

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');

require('dotenv').config();
const destSite = "https://hdapps.homedepot.com/LaborMgtTools/WFMEssLauncher"


var workDays = [];
if (!fs.existsSync('./workDays.json')) { // if the file doesn't exist, create it
    fs.writeFileSync('./workDays.json', JSON.stringify(workDays, 4));
}

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
                            // Call writeToFile if we're at the end of the array
                            if (i == rows.length && j == cells.length) {
                                writeToFile();
                            }
                        });
                    }
                }
            });
        });
    }

    const writeToFile = async () => {
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
    }

}).catch(err => {
    console.log(err);
});

