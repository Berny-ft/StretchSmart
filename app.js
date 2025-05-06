const express = require('express');
const path = require("path");
const fs = require('fs');
const ejs = require('ejs');
const app = express();
const PORT = 3000;
const axios = require('axios');
require('dotenv').config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// middleware to use ejs
app.set('view engine', 'ejs') // setting ejs as the view engine
app.set('views',path.join(__dirname,'views')); // the directory of the views

//setting up th statics so that they can be loaded to the front end
app.use(express.static(path.join(__dirname,'public')));

// we also need a middleware to parse body data whenever we use post
app.use(express.urlencoded({extended: false}));// that means that the content isn't shown


app.get(['/','/home'],async (req,res) => {

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


app.get('/profile', async (req, res)=>{

    const statsOBJ = fs.readFileSync((path.join(__dirname,'data','stats.json')));
    const stats = JSON.parse(statsOBJ);
    const numbOfStretches = stats.stretchSessions;
    const numbOfWarmups = stats.warmupSessions
    const body = await ejs.renderFile(path.join(__dirname,'views', 'profile.ejs'),
        {
            username : 'Berny',
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

app.post('/log/stretch', (req, res) => {
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

app.post('/log/warmup', (req, res) => {
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



app.post('/generate', async (req, res) => {
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


app.post('/reset', (req, res)=>{
    const statsOBJ = fs.readFileSync((path.join(__dirname,'data','stats.json')));
    const stats = JSON.parse(statsOBJ);
    stats.stretchSessions =0;
    stats.warmupSessions =0;
    fs.writeFileSync((path.join(__dirname,'data','stats.json')),JSON.stringify(stats,null, 2));
    return res.redirect('/profile');


});


app.use((req, res) => {
    res.status(404).send('Page not found.');
});


app.listen(3000,()=> {
    console.log("The server is running at  http://localhost:3000");
})

