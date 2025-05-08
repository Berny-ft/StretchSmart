const express = require('express');
const path = require("path");
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const ejs = require('ejs');
const app = express();
const PORT = 3000;
const User = require('./models/user');
const Activity = require('./models/activity');
const axios = require('axios');
const session =  require('express-session');
require('dotenv').config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const mongoURI = process.env.MONGOOSE; // placed it in the env file

//middleware to use express session to track the user
app.use(session({
    secret:"a random string",
    resave: false,
    saveUninitialized:false,
}))

// middleware to use ejs
app.set('view engine', 'ejs') // setting ejs as the view engine
app.set('views',path.join(__dirname,'views')); // the directory of the views

//setting up th statics so that they can be loaded to the front end
app.use(express.static(path.join(__dirname,'public')));

// we also need a middleware to parse body data whenever we use post
app.use(express.urlencoded({extended: false}));// that means that the content isn't shown

//Set up database
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => app.listen(3000,()=> {
    console.log("The server is running at  http://localhost:3000"); //Only want to listen once db is connected
})).catch(err => console.error('MongoDB connection error:', err));

// the authentication middleware
function auth(req,res,next){
    if(!req.session.userId){
        return res.redirect("/login")
    }
    next();
}

// the no caching middleware to block the browser from caching protected pages so that we can't revisit them after login out
/// this is not working for some reason
function noCache(req,res,next) {
    res.set('Cache-Control','no-store');
    next();
}

app.get(['/','/home'],auth,noCache,async (req,res) => {

    try {
        const statsOBJ = fs.readFileSync((path.join(__dirname,'data','stats.json')));
        const stats = JSON.parse(statsOBJ);
        const numbOfStretches = stats.stretchSessions;
        const numbOfWarmups = stats.warmupSessions

        const body = await ejs.renderFile((path.join(__dirname, 'views', 'home.ejs')),
            {
                numberOfStretches: numbOfStretches,
                numberOfWarmups: numbOfWarmups
            });

        res.render('layout.ejs',
            {
                stretches : undefined,
                pageName: 'home',
                content: body
            }
        );
    } catch (error){
        res.status(500);
        res.send('the server failed to serve the page')
    }
})

app.get('/login',(req, res)=> {
    fs.readFile(path.join(__dirname,'views','login.ejs'),"utf-8",(err,data)=>{
        if(err){
            return res.status(500).send("Internal Server error");
        } else {
            res.render('layout.ejs', {
                pageName : 'login',
                content:data,
                stretches:undefined
            })
        }
    })
})

app.get("/signup",(req,res)=>{
    fs.readFile(path.join(__dirname, 'views', 'signup.ejs'),'utf-8',(err, data)=>{
        if(err) {
            return res.status(500).send("internal Server Error")
        } else {
            res.render('layout.ejs', {
                pageName : 'signup',
                content:data,
                stretches:undefined
            })
        }
    })
})

app.post('/login', async (req, res) => {
    //get data
    const { username, password } = req.body;

    //check that username exists in database
    const user = await User.findOne({ username: username });
    if (!user) {
        res.redirect('/login');
    } else {
        //check password validity
        const isPasswordGood = await bcrypt.compare(password, user.password);
        if (isPasswordGood) {
            //update cookies
            req.session.userId = user._id;
            res.redirect('/home');

        } else {
            res.redirect('/login');
        }
    }
});

app.post('/signup', async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    //Note: Check that username and password have correct constraints and that both passwords are the same on the ejs file
    //check that username does not exist in database // should instead redirect if the username Does exist
    if((await User.exists({ username: username}))){
        return res.redirect('/signup'); // render a pop-up mentioning that the username is taken
    }

    //create account (add to db)
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
        username: username,
        password: hashedPassword
    });
    user.save().then(async () => {
        // start the session
        req.session.userId = user._id;

        // at this point we need to initialize the activity data of the user
        const activity = new Activity({
            username: user._id,
            pace: [],
            targetPace: 0,
            endDate: new Date(2000, 0,0),
            startDate: 0,
            stretchNumb: 0,
            warmNumb: 0
        })


        await activity.save();

        res.redirect('/');
    }).catch((err) => {
        res.status(500).send("Error adding new user.");
    });
});

app.get('/logout', auth,noCache, (req,res)=>{
    req.session.destroy(()=>{
        res.redirect('/login');
    });
})
app.get('/profile',auth, async (req, res)=>{
    // fetch the username from the database and
    const user = await User.findById(req.session.userId);
    const username = user?.username || 'User'; // if the username property exist or just User

    const statsOBJ = fs.readFileSync((path.join(__dirname,'data','stats.json')));
    const stats = JSON.parse(statsOBJ);
    const numbOfStretches = stats.stretchSessions;
    const numbOfWarmups = stats.warmupSessions
    const body = await ejs.renderFile(path.join(__dirname,'views', 'profile.ejs'),
        {
            username : username,
            days : 1,
            numberOfStretches : numbOfStretches,
            numberOfWarmups : numbOfWarmups

        })

    res.render('layout.ejs', {
        pageName : 'profile',
        stretches : undefined,
        content : body
    })
})


const statsPath = path.join(__dirname, 'data', 'stats.json');

app.post('/log/stretch',auth,noCache, (req, res) => {
    try {
        const progress = JSON.parse(fs.readFileSync(statsPath));
        progress.stretchSessions = (progress.stretchSessions || 0) + 1;
        fs.writeFileSync(statsPath, JSON.stringify(progress, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error("Failed to update stretch count:", err);
        res.sendStatus(500);
    }
});

app.post('/log/warmup', auth,noCache,(req, res) => {
    try {
        const progress = JSON.parse(fs.readFileSync(statsPath));
        progress.warmupSessions = (progress.warmupSessions || 0) + 1;
        fs.writeFileSync(statsPath, JSON.stringify(progress, null, 2));
        res.sendStatus(200);
    } catch (err) {
        console.error("Failed to update warm up count:", err);
        res.sendStatus(500);
    }
});



app.post('/generate', auth,noCache,async (req, res) => {
    const selectedType = req.body.type;
    const time = Math.round(req.body.time / 10);
    const effort = Math.round(req.body.effort / 10);
    const pain = Math.round(req.body.pain / 10);
    const details = req.body.details;

    if(time < 1 ){
        return res.redirect('/home');
    }




    if(selectedType === 'Warmup'){
        try {
            const data = fs.readFileSync(path.join(__dirname, 'data', 'warmupData.json'));
            const parsed = JSON.parse(data);

            const prompt = `
              Given the following:
              - Time constraint: ${time} minutes
              - Effort level: ${effort}/10
              - Pain level: ${pain}/10
              - Additional details: ${details}
            
              These are the conditions of a runner preparing for a performance-oriented long-distance effort (10K to 21K).
            
              Based on this and the following warm-up movement data: ${data}, return a **JSON array** of objects (chosen from the provided list) that:
              - Optimizes readiness for long-distance running
              - Stays within the total time limit provided
              - Adds a new "duration" field to each object (how long each movement should take in seconds)
              - Keeps all other properties unchanged
              - Does **not** create new movements — only use items from the provided list
            `;


            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    contents: [
                        {
                            parts: [{ text: prompt }]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            let replyText = geminiResponse.data.candidates[0].content.parts[0].text;
            replyText = replyText.replace(/```json|```/g, '').trim();

            const warmupList = JSON.parse(replyText);



            const body = await ejs.renderFile(path.join(__dirname,'views','stretch.ejs'),{
                logType : 'warmup'
            });

            return res.render('layout', {
                pageName: 'stretch',
                content: body,
                stretches: warmupList
            });


        } catch (error) {
            console.error(error.response?.data || error.message);
            return res.status(500).send("Error generating stretching plan.");
        }
    }


    try {
        const data = fs.readFileSync(path.join(__dirname, 'data', 'stretchData.json'));


        const prompt = `
          Given the following:
          - Time constraint: ${time} minutes
          - Effort level: ${effort}/10
          - Pain level: ${pain}/10
          - Additional details: ${details}
    
          These are the conditions of a runner aiming to recover effectively.
    
          Based on this and the following stretch data: ${data}, return a **JSON array** of objects (chosen from the provided list) that:
          - Maximizes recovery
          - Matches the time limit
          - Adds a new "duration" field in each object (how long each stretch should take)
          - Keeps other properties unchanged
          - stick to the list of stretches provided no matter what
        `;

        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        let replyText = geminiResponse.data.candidates[0].content.parts[0].text;
        replyText = replyText.replace(/```json|```/g, '').trim();

        const stretchList = JSON.parse(replyText);



        const body = await ejs.renderFile(path.join(__dirname,'views','stretch.ejs'), {
            logType: 'stretch'
        });

        res.render('layout', {
            pageName: 'stretch',
            content: body,
            stretches: stretchList
        });


    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send("Error generating stretching plan.");
    }
});


app.post('/reset',auth,noCache, (req, res)=>{
    const statsOBJ = fs.readFileSync((path.join(__dirname,'data','stats.json')));
    const stats = JSON.parse(statsOBJ);
    stats.stretchSessions =0;
    stats.warmupSessions =0;
    fs.writeFileSync((path.join(__dirname,'data','stats.json')),JSON.stringify(stats,null, 2));
    return res.redirect('/profile');


});



app.get("/sports",auth,noCache,(req,res)=>{

    fs.readFile(path.join(__dirname, 'views', 'sports.ejs'),'utf8',(err, data)=>{
        if(err) {
            return res.status(500).send("internal Server Error")
        } else {
            res.render('layout.ejs', {
                pageName : 'sports',
                content:data,
                stretches:undefined
            })
        }
    })
})

function formatPace(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function unFormatPace(string){
    const [min, sec] = string.split(':').map(Number);
    return (60*min)+sec
}

function toMinutes(array){
    const times = array.map((value) =>{
        return value.time/60 // convert to minutes
    })

    const dates = array.map((value)=> {
        return value.date.toLocaleDateString('en-US', { dateStyle: 'short' });
    })

    return {
        times,
        dates
    }
}

app.get("/sports/run", auth, noCache, async (req, res) => {
    try {
        const userId = req.session.userId;
        const activity = await Activity.findOne({ username: userId });

        const lastPace = activity?.pace.length ? activity.pace[activity.pace.length - 1].time : 0;
        const bestPace = activity?.pace.length
            ? Math.min(...activity.pace.map(p => p.time))
            : 0;
        const formattedTarget = formatPace(activity?.targetPace || 0);
        const formattedBest = formatPace(bestPace);
        const formattedCurrent = formatPace(lastPace);
        //const {graphTimes, graphDates} = toMinutes(activity.pace);
        const { times: graphTimes, dates: graphDates } = toMinutes(activity.pace);

        const targetPaceValue = activity?.targetPace || 0;
        let progressPercentage = 0;
        let cappedProgress = 0;

        if (targetPaceValue > 0 && lastPace > 0) {
            progressPercentage = (targetPaceValue / lastPace) * 100; // How close current is to target
            cappedProgress = Math.min(progressPercentage, 100); // Cap for progress bar
        }


        console.log(graphDates);
        console.log(graphTimes);

        const body = await ejs.renderFile(path.join(__dirname, 'views', 'run.ejs'), {
            progressPercentage: progressPercentage.toFixed(0),
            graphTimes : graphTimes,
            graphDates : graphDates,
            currentPace: formattedCurrent,
            targetPace: formattedTarget,
            bestPace: formattedBest,
            daysRemaining: activity?.endDate ? Math.ceil((new Date(activity.endDate) - Date.now()) / (1000 * 60 * 60 * 24)) : 0,
        });

        res.render('layout.ejs', {
            pageName: 'run',
            content: body,
            stretches: undefined
        });
    } catch (e) {
        console.log(e.toString());
        return res.status(500).send("internal Server Error");
    }
});

app.post('/sports/run/edit', auth, noCache, async (req, res) => {
    const { targetPace, endDate } = req.body;
    const userId = req.session.userId;

    const activity = await Activity.findOne({ username: userId });
    if (!activity) return res.status(404).send("Activity not found");

    // Update targetPace only if provided
    if (targetPace && targetPace.trim() !== '') {
        const [min, sec] = targetPace.split(':').map(Number);
        activity.targetPace = (min * 60) + sec;
    }

    // Update endDate only if provided
    if (endDate && endDate.trim() !== '') {
        activity.endDate = endDate;
    }

    await activity.save();
    return res.redirect('/sports/run');
});

app.post('/sports/run/add',auth, noCache, async (req,res)=>{
    const {sessionDate, sessionPace} = req.body;
    const userId = req.session.userId
    const activity = await Activity.findOne({username: userId})

    const entry = {
        time : unFormatPace(sessionPace),
        date : new Date(sessionDate), // the cpy constructor
    }
    activity.pace.push(entry);
    await activity.save();
    return res.redirect('/sports/run')

})

app.post('/sports/run/delete', auth, noCache, async (req, res) => {
    try {
        const userId = req.session.userId;
        const activity = await Activity.findOne({ username: userId });

        // Reset running-related data
        activity.pace = [];
        activity.targetPace = 0;
        activity.endDate = new Date(2000, 0, 0);

        await activity.save();
        res.redirect('/sports/run');
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send("Error resetting running data");
    }
});

/*
app.get("/sports/swim",auth,noCache,(req,res)=>{
    fs.readFile(path.join(__dirname, 'views', 'swim.ejs'),'utf8',(err, data)=>{
        if(err) {
            return res.status(500).send("internal Server Error")
        } else {
            res.render('layout.ejs', {
                pageName : 'swim',
                content:data,
                stretches:undefined
            })
        }
    })
})

app.get("/sports/bike",auth,noCache,(req,res)=>{
    fs.readFile(path.join(__dirname, 'views', 'bike.ejs'),'utf8',(err, data)=>{
        if(err) {
            return res.status(500).send("internal Server Error")
        } else {
            res.render('layout.ejs', {
                pageName : 'bike',
                content:data,
                stretches:undefined
            })
        }
    })
})


 */


app.use((req, res) => {
    res.status(404).send('Page not found.');
});
