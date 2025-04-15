const express = require('express');
const path = require("path");
const fs = require('fs');
const ejs = require('ejs');
const app = express();
const PORT = 3000;

// middleware to use ejs
app.set('view engine', 'ejs') // setting ejs as the view engine
app.set('views',path.join(__dirname,'views')); // the directory of the views

//setting up th statics so that they can be loaded to the front end
app.use(express.static(path.join(__dirname,'public','images')));

// we also need a middleware to parse body data whenever we use post
app.use(express.urlencoded({extended: false}));// that means that the content isn't shown


app.get(['/','/home'],async (req,res) => {

    try {

        const body = await ejs.renderFile((path.join(__dirname, 'views', 'home.ejs')),
            {
                numberOfStretches: 2,
                numberOfWarmups: 2
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

app.get('/progress', async (req, res)=>{

    /*
    // we first need to build all the necessary cards then render the all of them into an array

    const dataStretches = fs.readFileSync(path.join(__dirname,'data','stretchData.json'));
    const stretches = JSON.parse(dataStretches); // here we parse the data so that we can call it


    // render the progress.ejs file to load all the cards in the html
    const body = await ejs.renderFile(path.join(__dirname, 'views', 'progress.ejs'),
        {stretches}
        )
    // render the layout with the progress page
    res.render('layout',{
        pageName : 'progress',
        content : body
    })

     */

    res.render('layout',{
        stretches : undefined,
        pageName : 'progress',
        content : '<h1>This Page is currently in production</h1>'
    })

})


app.get('/stretch', async (req,res) => {

    const s1 = 'Hamstring Reach';
    const s2 = 'Standing Quad Stretch';
    const s3 = 'Calf Stretch';
    const s4 = 'Hip Flexor Lunge';
    const names = [s1,s2,s3,s4];
    // now we want to select the import the file json read it and for each we want to select a random number and create an array palce them in the image section
    const data = fs.readFileSync(path.join(__dirname,'data','stretchData.json'));
    let parsed = JSON.parse(data);


    parsed = parsed.filter((stretch)  => {
        return !names.includes(stretch.name)
    } )
    console.log(parsed);

    // we need to write back this value to the js of the original page


    const body  = await ejs.renderFile(path.join(__dirname,'views','stretch.ejs')) //just rendering the page
    res.render('layout',{
        pageName:'stretch',
        content: body,
        stretches : parsed // sedding the parsed data to the to layout so that it can be used
    })

})



app.get('/profile', async (req, res)=>{

    const body = await ejs.renderFile(path.join(__dirname,'views', 'profile.ejs'),
        {
            username : 'Berny',
            days : 1,
            numberOfStretches : 2,
            numberOfWarmups : 9

        })

    res.render('layout.ejs', {
        pageName : 'profile',
        stretches : undefined,
        content : body
    })
})

app.listen(3000, ()=> {
    console.log("The server is running at http://172.16.4.137:3000  http://localhost:3000");
})

