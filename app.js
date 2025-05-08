const express = require('express');
const path = require("path");
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const ejs = require('ejs');
const app = express();
const PORT = 3000;
const User = require('./models/user');
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
/// this is working for some reason
function noCache(req,res,next) {
    res.set('Cache-Control','no-store');
    next();
}

app.get(['/','/home'],auth,noCache,async (req,res) => {

    try {
       const user = await User.findById(req.session._userId);
       const body = {
            numberOfStretches: user.stretches,
            numberOfWarmups: user.warmups
       };
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
    const { username, password } = req.body;
    //Note: Check that username and password have correct constraints on the ejs file
    //check that username does not exist in database // should instead redirect if the username Does exist
    if((await User.exists({ username: username}))){
        return res.redirect('/signup'); // render a pop-up mentioning that the username is taken
    }

    //create account (add to db)
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
        username: username,
        password: hashedPassword,
        warmups: 0,
        stretches: 0
    });
    user.save().then(() => {
        // start the session
        req.session.userId = user._id;
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
    const numbOfStretches = user.stretches;
    const numbOfWarmups = user.warmups;
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


app.post('/log/stretch',auth,noCache, async (req, res) => {
    try {
        const user = await User.findById(req.session._userId);
        user.stretches += 1;
        await user.save();
        res.sendStatus(200);
    } catch (err) {
        console.error("Failed to update stretch count:", err);
        res.sendStatus(500);
    }
});

app.post('/log/warmup', auth,noCache,async (req, res) => {
    try {
        const user = await User.findById(req.session._userId);
        user.warmups += 1;
        await user.save();
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


app.post('/reset',auth,noCache, async (req, res)=>{
    const user = await User.findById(req.session._userId);
    user.stretches = 0;
    user.warmups = 0;
    await user.save();
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

app.get("/sports/run",auth,noCache,(req,res)=>{

    fs.readFile(path.join(__dirname, 'views', 'run.ejs'),'utf8',(err, data)=>{
        if(err) {
            return res.status(500).send("internal Server Error")
        } else {
            res.render('layout.ejs', {
                pageName : 'run',
                content:data,
                stretches:undefined
            })
        }
    })
})

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

app.use((req, res) => {
    res.status(404).send('Page not found.');
});

/*
    How to add an activity:
    const { distance, pace, date } = req.body;
    const user = User.findById(req.session._userId);
    const newActivity = {
        distance,
        pace,
        date: date ? new Date(date) : new Date() // default to now if date not provided
    };
    user.activities.push(newActivity);
    await user.save();
*/
/*
    How to add a goal:
    const { distance, pace, startDate, endDate } = req.body;
    const user = User.findById(req.session._userId);
    const newGoal = {
        distance,
        pace,
        startDate: date ? new Date(date) : new Date(), // default to now if date not provided
        endDate: date ? new Date(date) : new Date() // default to now if date not provided
    };
    user.goals.push(newGoal);
    await user.save();
*/